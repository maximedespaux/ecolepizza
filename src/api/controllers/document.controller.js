const crypto = require('crypto');
const db = require('../config/database.js');
const { renderDocumentHTML } = require('../lib/render.js');
const { templateSlugFor, renderTemplate } = require('../lib/docxfill.js');
const { getTemplateContent, loadOrgSteps, loadCustomTokens } = require('./template.controller.js');
const { stagiaireSignsDoc, companySignsDoc, orgSignsDoc, externalSignsDoc } = require('../lib/documents.js');

/**
 * La signature de ce document incombe-t-elle à l'entreprise ?
 *
 * Deux conditions : le modèle le prévoit (company_sign) ET LE DOSSIER auquel ce document
 * appartient est rattaché à une entreprise.
 *
 * C'est bien le DOSSIER qui tranche, pas la fiche du stagiaire. On lisait auparavant
 * learner.company_id — or ce champ est posé à vie dès le premier rattachement. Une personne
 * venue une fois par son employeur, puis inscrite d'elle-même à une autre session, voyait donc
 * TOUS ses documents passer « à signer par l'entreprise », y compris ceux de la session
 * qu'elle payait seule : elle ne pouvait plus signer ses propres papiers, et l'employeur
 * recevait des documents qui ne le regardaient pas.
 *
 * Un document sans dossier rattaché (document libre) n'est signé par personne d'autre que son
 * destinataire : sans enrollment, pas d'entreprise.
 */
async function docSignedByCompany(conn, orgSteps, doc) {
    if (!companySignsDoc(orgSteps, doc) || !doc.learner_id) return false;
    try {
        const [[r]] = await conn.query(
            `SELECT e.company_id FROM document_formation df
             JOIN enrollment e ON e.id = df.enrollment_id
             WHERE df.document_id = ? LIMIT 1`,
            [doc.id]
        );
        return !!(r && r.company_id);
    } catch { return false; }
}
const { renderTemplateHtml } = require('../lib/htmlfill.js');
const { composeDocumentPdf } = require('../lib/pdfcompose.js');
const { findMissingTokens } = require('../lib/tokens.js');
const { docxToPdf, htmlToPdf } = require('../lib/docxpdf.js');
const { buildEmargementDocHtml } = require('../lib/emargement.js');
const { logAudit } = require('../lib/audit.js');
const { encrypt, decrypt } = require('../lib/crypto.js');
const { getEnabledFields, loadDossierFactsMap, evalCondition } = require('../lib/conditions.js');
const { matchStep } = require('../lib/documents.js');
const { notify } = require('./notification.controller.js');

// IP « client » (best-effort, derrière proxy éventuel).
function clientIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.ip || req.socket?.remoteAddress || null;
}

// Certificat de scellement de l'organisme (génère + stocke chiffré au 1er usage).
async function getOrgSigner(conn, orgId, orgName) {
    const { generateOrgP12 } = require('../lib/pdfseal.js');
    const [[org]] = await conn.query('SELECT sign_cert FROM organization WHERE id = ?', [orgId]);
    if (org && org.sign_cert) {
        const b64 = decrypt(org.sign_cert);
        if (b64) return Buffer.from(b64, 'base64');
    }
    const p12 = generateOrgP12(orgName || 'Organisme');
    await conn.query('UPDATE organization SET sign_cert = ? WHERE id = ?', [encrypt(p12.toString('base64')), orgId]);
    return p12;
}

// Rend le HTML rempli d'un document (déterministe, sans LibreOffice) pour empreinte.
async function buildDocHtml(conn, orgId, doc) {
    const ctx = await loadContext(conn, orgId, doc.learner_id, doc.id);
    ctx.signature = { data: decrypt(doc.signature_data), name: doc.signer_name, date: doc.signed_at };
    if (isEmargDoc(doc)) return await renderEmargDoc(conn, orgId, doc, ctx);
    const f = (ctx.formations && ctx.formations[0]) || {};
    const slug = doc.template_slug || templateSlugFor(doc.type, { financing: f.financing, rsCode: f.rs_code, hygiene: !!f.hygiene, jours: f.days });
    if (!slug) return null;
    const content = await getTemplateContent(orgId, slug);
    if (!content || content.kind !== 'builder') return null;
    return renderTemplateHtml(content.html, ctx, { title: doc.title || '', headerHtml: content.header, footerHtml: content.footer });
}

const TYPE_LABELS = {
    DEVIS: 'Devis', CONTRAT: 'Contrat de formation', CONVENTION: 'Convention de formation',
    DROIT_IMAGE: "Droit à l'image", CONVOCATION: "Convocation à l'examen", INVITATION: 'Invitation',
    CERTIFICAT_REALISATION: 'Certificat de réalisation', PROGRAMME: 'Programme de formation',
    ATTESTATION_HYGIENE: 'Attestation Hygiène', FICHE_SEMAINE: "Fiche d'expression de besoin",
    TEST_POSITIONNEMENT: 'Test de positionnement', EMARGEMENT: "Feuille d'émargement",
    EVALUATION_MANAGEUR: 'Évaluation Manageur', EVALUATION_FINANCEUR: 'Évaluation Financeur',
    CGV: 'Conditions générales de vente',
};

// Ordre des étapes du pipeline CRM (avancement automatique, jamais en arrière).
const STAGE_ORDER = ['PROSPECT', 'CONTACTE', 'DEVIS_ENVOYE', 'DEVIS_SIGNE', 'ACOMPTE_PAYE', 'INSCRIT', 'EN_FORMATION', 'TERMINE', 'EVALUATION_ENVOYEE', 'ARCHIVE'];

/** Fait avancer les dossiers liés à un document jusqu'à `targetStage` (sans reculer). */
async function advanceEnrollments(conn, orgId, documentId, targetStage) {
    const ti = STAGE_ORDER.indexOf(targetStage);
    if (ti < 0) return;
    const [rows] = await conn.query(
        `SELECT e.id, e.crm_stage FROM document_formation df
         JOIN enrollment e ON e.id = df.enrollment_id WHERE df.document_id = ?`,
        [documentId]
    );
    for (const e of rows) {
        if (STAGE_ORDER.indexOf(e.crm_stage) < ti) {
            await conn.query('UPDATE enrollment SET crm_stage = ? WHERE id = ? AND organization_id = ?',
                [targetStage, e.id, orgId]);
        }
    }
}

// Charge le contexte de fusion (organisme, stagiaire, entreprise, formations).
async function loadContext(conn, organizationId, learnerId, documentId) {
    const [[org]] = await conn.query('SELECT * FROM organization WHERE id = ?', [organizationId]);
    if (org) org.signature_image = decrypt(org.signature_image); // signature organisme chiffrée au repos
    // Si le document a été signé par l'organisme (à l'envoi), on affiche CETTE signature.
    if (org && documentId) {
        try {
            const [[gd]] = await conn.query('SELECT org_signature_data FROM generated_document WHERE id = ?', [documentId]);
            if (gd && gd.org_signature_data) org.signature_image = decrypt(gd.org_signature_data);
        } catch (e) {
            if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; // migration 049 non jouée : signature statique
        }
    }
    // Anti-fuite inter-organisation : on ne charge le stagiaire QUE s'il appartient à
    // l'organisme du document (sinon un document d'un org lié à un learner_id d'un autre
    // org ne doit jamais révéler ses données).
    const [[learner]] = await conn.query('SELECT * FROM learner WHERE id = ? AND organization_id = ?', [learnerId, organizationId]);
    let company = null;
    const [formations] = await conn.query(
        `SELECT p.code, p.title, p.days, p.hours, p.price, p.hygiene, p.rs_code AS rs_code,
                p.audience, p.objectives, p.objective_general, p.duration_detail, p.program_detail,
                s.year, s.week,
                DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                e.financing, e.price AS enroll_price, e.acompte, e.company_id
         FROM document_formation df
         JOIN enrollment e ON e.id = df.enrollment_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         WHERE df.document_id = ?`,
        [documentId]
    );
    // L'entreprise dont on remplira les jetons est celle DU DOSSIER de ce document. Lire
    // learner.company_id faisait apparaître l'employeur sur les documents d'une inscription
    // que le stagiaire portait seul — même raison que dans docSignedByCompany.
    const isPro = formations.some((f) => f.financing === 'PROFESSIONNEL');
    const dossierCompanyId = (formations.find((f) => f.company_id) || {}).company_id || null;
    if (isPro && dossierCompanyId) {
        const [cRows] = await conn.query('SELECT * FROM company WHERE id = ?', [dossierCompanyId]);
        company = cRows[0] || null;
    }
    // Document « entreprise » (migration 077) : entreprise portée par le document, et
    // groupe de tous les stagiaires liés (jeton {Stagiaires}).
    let groupStagiaires = [];
    if (documentId) {
        // Infos du document entreprise (entreprise + session + OPCO) — colonnes présentes
        // selon migrations 077 / 089 : on lit en cascade.
        let gdInfo = null;
        for (const cols of ['company_id, session_id, opco', 'company_id, session_id']) {
            try { const [[gd2]] = await conn.query(`SELECT ${cols} FROM generated_document WHERE id = ?`, [documentId]); gdInfo = gd2 || null; break; }
            catch (e) { if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; }
        }
        if (!company && gdInfo && gdInfo.company_id) { const [cr] = await conn.query('SELECT * FROM company WHERE id = ?', [gdInfo.company_id]); company = cr[0] || company; }

        if (gdInfo && gdInfo.company_id && gdInfo.session_id) {
            // Document entreprise : liste VIVANTE des stagiaires de l'entreprise inscrits à
            // cette session (et pas un instantané figé). Si le document est groupé par OPCO
            // (migration 089), on ne liste que les stagiaires de CET OPCO.
            const params = [gdInfo.company_id, gdInfo.session_id, organizationId];
            let opcoFilter = '';
            if (gdInfo.opco !== undefined) { opcoFilter = " AND TRIM(COALESCE(l.opco, '')) = ?"; params.push((gdInfo.opco || '').trim()); }
            const [gs] = await conn.query(
                `SELECT DISTINCT l.id, l.civility, l.first_name, l.last_name, l.email,
                        l.phone, l.opco, l.town, l.address, l.zip_code, l.birth_place,
                        DATE_FORMAT(l.birthday, '%Y-%m-%d') AS birthday
                 FROM enrollment e
                 JOIN learner l ON l.id = e.learner_id
                 WHERE e.company_id = ? AND e.session_id = ? AND e.organization_id = ?${opcoFilter}
                 ORDER BY l.last_name, l.first_name`,
                params
            );
            groupStagiaires = gs;
        } else {
            // Fallback (document classique lié à des formations) : via document_formation.
            const [gs] = await conn.query(
                `SELECT DISTINCT l.id, l.civility, l.first_name, l.last_name, l.email,
                        l.phone, l.opco, l.town, l.address, l.zip_code, l.birth_place,
                        DATE_FORMAT(l.birthday, '%Y-%m-%d') AS birthday
                 FROM document_formation df
                 JOIN enrollment e ON e.id = df.enrollment_id
                 JOIN learner l ON l.id = e.learner_id
                 WHERE df.document_id = ? ORDER BY l.last_name, l.first_name`,
                [documentId]
            );
            groupStagiaires = gs;
        }
    }
    // Signatures multiples (jetons sig:<slot>) — chargées si la table existe (migration 061).
    const slotSignatures = {};
    if (documentId) {
        try {
            const [sigs] = await conn.query('SELECT slot, label, signature_data, signer_name, signed_at FROM document_signature WHERE document_id = ?', [documentId]);
            for (const s of sigs) slotSignatures[s.slot] = { data: decrypt(s.signature_data), name: s.signer_name, date: s.signed_at, label: s.label };
        } catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; }
    }
    // Champs « documents » (colonnes du dossier activées) : valeurs pour les jetons
    // field:<table.column>. Chargées pour le dossier lié au document.
    const fields = {};
    if (documentId) {
        try {
            const [[df]] = await conn.query('SELECT enrollment_id FROM document_formation WHERE document_id = ? LIMIT 1', [documentId]);
            if (df && df.enrollment_id) {
                const catalog = await getEnabledFields(conn, organizationId);
                const facts = (await loadDossierFactsMap(conn, organizationId, [df.enrollment_id], catalog)).get(df.enrollment_id) || {};
                for (const [k, v] of Object.entries(facts)) fields[k] = (typeof v === 'string') ? decrypt(v) : v;
                // Lieu de formation de la session (jetons field:location.<colonne>).
                try {
                    const [[loc]] = await conn.query(
                        `SELECT tl.name, tl.address, tl.zip_code, tl.town
                         FROM enrollment e JOIN training_session s ON s.id = e.session_id
                         LEFT JOIN training_location tl ON tl.id = s.location_id
                         WHERE e.id = ?`, [df.enrollment_id]);
                    if (loc) for (const k of ['name', 'address', 'zip_code', 'town']) fields['location.' + k] = loc[k] || '';
                } catch { /* migration des lieux (067) non appliquée */ }
            }
        } catch (e) { /* champs indisponibles (migration non jouée) : on ignore */ }
    }
    // Financeur (OPCO / France Travail…) : coordonnées propres, dont un SIRET distinct de
    // l'organisme. Résolu par le nom stocké (company.opco ou learner.opco) → référentiel opco.
    let financeur = null;
    const opcoName = (company && company.opco) || (learner && learner.opco) || '';
    if (opcoName) {
        try {
            const [[fo]] = await conn.query('SELECT * FROM opco WHERE organization_id = ? AND (name = ? OR code = ?) LIMIT 1', [organizationId, opcoName, opcoName]);
            financeur = fo || null;
        } catch (e) { /* référentiel opco absent (migration) : jetons financeur vides */ }
    }
    // Jetons personnalisés de l'organisme (calculés à partir des autres au rendu).
    let customTokens = [];
    try { customTokens = await loadCustomTokens(organizationId); } catch { /* migration absente */ }
    return { org: org || {}, learner: learner || {}, company, formations, slotSignatures, fields, customTokens, groupStagiaires, financeur };
}

// Un document d'émargement (type EMARGEMENT) : rendu via le moteur d'émargement
// (grille visuelle) + un bloc de signatures ÉLECTRONIQUES (stagiaire + organisme).
const isEmargDoc = (doc) => !!doc && doc.type === 'EMARGEMENT';
async function renderEmargDoc(conn, orgId, doc, ctx) {
    const [[df]] = await conn.query('SELECT enrollment_id FROM document_formation WHERE document_id = ? LIMIT 1', [doc.id]);
    if (!df) return null;
    let config = null;
    if (doc.template_slug) {
        try {
            const [[t]] = await conn.query('SELECT config FROM emargement_template WHERE organization_id = ? AND slug = ?', [orgId, doc.template_slug]);
            if (t) config = t.config;
        } catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; }
    }
    const org = ctx.org || {};
    return buildEmargementDocHtml(conn, orgId, df.enrollment_id, {
        config,
        learnerSig: decrypt(doc.signature_data), learnerName: doc.signer_name, signedAt: doc.signed_at,
        orgSig: decrypt(doc.org_signature_data) || org.signature_image || null,
        orgName: org.legal_name || org.short_name || '',
    });
}

/**
 * GET /api/documents?learner_id=... — documents d'un stagiaire + ses formations
 * (pour le regroupement).
 */
const listDocuments = async (req, res) => {
    const learnerId = req.query.learner_id;
    if (!learnerId) return res.status(422).json({ error: 'learner_id requis' });
    try {
        const conn = db.promise();
        const [documents] = await conn.query(
            `SELECT d.id, d.type, d.title, d.status,
                    DATE_FORMAT(d.sent_at, '%Y-%m-%d %H:%i') AS sent_at,
                    DATE_FORMAT(d.signed_at, '%Y-%m-%d %H:%i') AS signed_at, d.signer_name,
                    GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ', ') AS formations
             FROM generated_document d
             LEFT JOIN document_formation df ON df.document_id = d.id
             LEFT JOIN enrollment e ON e.id = df.enrollment_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE d.learner_id = ? AND d.organization_id = ?
             GROUP BY d.id
             ORDER BY d.created_at DESC`,
            [learnerId, req.user.organization_id]
        );
        const [enrollments] = await conn.query(
            `SELECT e.id, e.financing, p.code AS program_code, p.title AS program_title,
                    s.year, s.week,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.learner_id = ? AND e.organization_id = ?
             ORDER BY s.year, s.week, p.code`,
            [learnerId, req.user.organization_id]
        );
        res.json({ data: { documents, enrollments } });
    } catch (err) {
        console.error('Erreur liste documents :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Prépare un document pour UN stagiaire (A_FAIRE) en remplaçant sa version en attente
 * (non signée). Réutilisable (fiche stagiaire ET génération de groupe). Renvoie l'id.
 */
async function prepareLearnerDoc(conn, orgId, { learnerId, type, templateSlug, title, enrollmentIds }) {
    const [dups] = await conn.query(
        `SELECT DISTINCT gd.id FROM generated_document gd
         JOIN document_formation df ON df.document_id = gd.id
         WHERE gd.organization_id = ? AND df.enrollment_id IN (?)
           AND gd.status <> 'SIGNE'
           AND (${templateSlug ? 'gd.template_slug = ?' : 'gd.type = ?'})`,
        [orgId, enrollmentIds, templateSlug || type]
    );
    for (const d of dups) await conn.query('DELETE FROM generated_document WHERE id = ? AND organization_id = ?', [d.id, orgId]);
    const documentId = crypto.randomUUID();
    await conn.query(
        `INSERT INTO generated_document (id, organization_id, learner_id, type, template_slug, title, status)
         VALUES (?, ?, ?, ?, ?, ?, 'A_FAIRE')`,
        [documentId, orgId, learnerId, type, templateSlug || null, title || TYPE_LABELS[type] || type]
    );
    for (const eid of enrollmentIds) await conn.query('INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)', [documentId, eid]);
    if (type === 'FICHE_SEMAINE') await advanceEnrollments(conn, orgId, documentId, 'CONTACTE');
    return documentId;
}

/**
 * POST /api/documents — prépare un document (statut A_FAIRE, non envoyé).
 * Corps : { learner_id, type, title?, enrollment_ids: [] }.
 */
const createDocument = async (req, res) => {
    const { learner_id, type, title, enrollment_ids, template_slug } = req.body;
    if (!learner_id || !type || !Array.isArray(enrollment_ids) || enrollment_ids.length === 0) {
        return res.status(422).json({ error: 'Stagiaire, type et au moins une formation requis.' });
    }
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        // Anti-injection inter-organisation : le stagiaire ET les dossiers fournis dans le
        // corps doivent appartenir à l'organisme de l'appelant (et les dossiers à ce stagiaire).
        const [[l]] = await conn.query('SELECT id FROM learner WHERE id = ? AND organization_id = ?', [learner_id, orgId]);
        if (!l) return res.status(404).json({ error: 'Stagiaire introuvable.' });
        const enrIds = [...new Set(enrollment_ids.map((x) => String(x)))];
        const [okEnr] = await conn.query(
            'SELECT id FROM enrollment WHERE id IN (?) AND organization_id = ? AND learner_id = ?',
            [enrIds, orgId, learner_id]);
        if (okEnr.length !== enrIds.length) return res.status(422).json({ error: 'Formation(s) invalide(s) pour ce stagiaire.' });
        const documentId = await prepareLearnerDoc(conn, orgId, { learnerId: learner_id, type, templateSlug: template_slug, title, enrollmentIds: enrIds });
        res.status(201).json({ message: 'Document préparé', id: documentId });
    } catch (err) {
        console.error('Erreur création document :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Libellés des conditions INTÉGRÉES (applies_when), pour un message lisible.
const BUILTIN_RULE_LABELS = {
    financing: 'Type de financement', rs: 'Formation certifiante (RS)',
    hygiene: 'Formation hygiène', jours: 'Nombre de jours', agefice: 'Financement AGEFICE',
};

/**
 * POST /api/documents/check-conditions — le modèle s'applique-t-il aux dossiers choisis ?
 * Corps : { template_slug, enrollment_ids }. Renvoie { ok, failed:[{slug,label}] } —
 * les RÈGLES (conditions de l'organisme) non respectées, pour l'expliquer à l'écran.
 * En erreur : on renvoie ok (jamais de blocage dû à un bug).
 */
const checkDocumentConditions = async (req, res) => {
    const passthrough = () => res.json({ data: { ok: true, failed: [] } });
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const { template_slug, enrollment_ids } = req.body || {};
        if (!template_slug || !Array.isArray(enrollment_ids) || !enrollment_ids.length) return passthrough();

        const step = (await loadOrgSteps(orgId)).find((s) => s.slug === template_slug);
        if (!step) return passthrough();
        const applies = step.applies_when || {};
        const customSlugs = Array.isArray(applies.conditions) ? applies.conditions : [];
        const builtinKeys = ['financing', 'rs', 'hygiene', 'jours', 'agefice'].filter((k) => applies[k] != null);
        if (!customSlugs.length && !builtinKeys.length) return passthrough(); // aucune règle

        // Conditions personnalisées AVEC leur intitulé lisible.
        const condById = new Map();
        try {
            const [rows] = await conn.query('SELECT slug, label, field, op, value FROM document_condition WHERE organization_id = ?', [orgId]);
            for (const r of rows) {
                let v = r.value;
                try { v = r.value == null ? null : JSON.parse(r.value); } catch { /* garde brut */ }
                condById.set(r.slug, { label: r.label, field: r.field, op: r.op, value: v });
            }
        } catch (e) { if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; }

        // Dossiers ciblés (strictement ceux de l'organisme).
        const [enrs] = await conn.query(
            `SELECT e.id, e.financing, l.opco, p.rs_code, p.hygiene, p.days
             FROM enrollment e
             LEFT JOIN learner l ON l.id = e.learner_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.organization_id = ? AND e.id IN (?)`,
            [orgId, enrollment_ids]
        );
        if (!enrs.length) return passthrough();
        const catalog = await getEnabledFields(conn, orgId, 'condition');
        const factsMap = await loadDossierFactsMap(conn, orgId, enrs.map((e) => e.id), catalog);

        const failed = new Map(); // clé -> intitulé (dédupliqué entre dossiers)
        for (const e of enrs) {
            const facts = factsMap.get(e.id) || {};
            const ctx = {
                financing: e.financing, rsCode: e.rs_code, hygiene: !!e.hygiene, jours: e.days,
                agefice: (e.opco || '').toUpperCase() === 'AGEFICE', ...facts,
            };
            for (const k of builtinKeys) {
                if (!matchStep({ [k]: applies[k] }, ctx)) failed.set(`builtin:${k}`, BUILTIN_RULE_LABELS[k] || k);
            }
            for (const slug of customSlugs) {
                const cond = condById.get(slug);
                if (cond && !evalCondition(cond, facts)) failed.set(slug, cond.label || slug);
            }
        }
        res.json({ data: { ok: failed.size === 0, failed: [...failed].map(([slug, label]) => ({ slug, label })) } });
    } catch (err) {
        console.error('Erreur vérification des conditions :', err);
        passthrough();
    }
};

/**
 * GET /api/documents/:id — document + contenu HTML fusionné (aperçu).
 */
const getDocument = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT * FROM generated_document WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Document introuvable' });
        const doc = rows[0];

        // Anti-IDOR : un non-membre du personnel ne peut lire que ses propres documents.
        const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'];
        if (!STAFF.includes(req.user.role)) {
            const [own] = await conn.query('SELECT id FROM learner WHERE id = ? AND user_id = ?', [doc.learner_id, req.user.id]);
            if (own.length === 0) return res.status(403).json({ message: 'Accès refusé' });
        }

        const ctx = await loadContext(conn, doc.organization_id, doc.learner_id, doc.id);
        const html = renderDocumentHTML(doc.type, ctx, doc.title);
        // Signature stagiaire pilotée par le modèle (Modeles de document : stagiaire_sign).
        const orgSteps = await loadOrgSteps(doc.organization_id);
        // Document dont la signature incombe à l'entreprise : pas signable par le stagiaire.
        const byCompany = await docSignedByCompany(conn, orgSteps, doc);
        res.json({
            data: {
                id: doc.id, type: doc.type, title: doc.title, status: doc.status,
                sent_at: doc.sent_at, signed_at: doc.signed_at, signer_name: doc.signer_name,
                signature_data: decrypt(doc.signature_data),
                signable: !byCompany && (isEmargDoc(doc) || stagiaireSignsDoc(orgSteps, doc)),
                company_sign: byCompany,
                external_sign: externalSignsDoc(orgSteps, doc), // signataire externe requis (lien partageable)
                org_signable: orgSignsDoc(orgSteps, doc), // émargement : l'organisme ne signe pas à l'envoi (envoyé non signé)
                org_signed: !!doc.org_signed_at,
                org_signer_name: doc.org_signer_name || null,
                org_signed_at: doc.org_signed_at || null,
                // Traçabilité de la signature électronique (déchiffrée pour l'affichage).
                signer_ip: decrypt(doc.signer_ip) || null,
                signer_user_agent: decrypt(doc.signer_user_agent) || null,
                signed_hash: doc.signed_hash || null,
                html,
            },
        });
    } catch (err) {
        console.error('Erreur lecture document :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Charge le document + contexte + remplit le modèle Word. Renvoie { doc, out } ou
// une réponse d'erreur (retourne null si déjà répondu).
async function fillForRequest(req, res) {
    const conn = db.promise();
    const [rows] = await conn.query(
        'SELECT * FROM generated_document WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id]
    );
    if (rows.length === 0) { res.status(404).json({ message: 'Document introuvable' }); return null; }
    const doc = rows[0];

    const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'];
    if (!STAFF.includes(req.user.role)) {
        const [own] = await conn.query('SELECT id FROM learner WHERE id = ? AND user_id = ?', [doc.learner_id, req.user.id]);
        if (own.length === 0) { res.status(403).json({ message: 'Accès refusé' }); return null; }
    }

    const ctx = await loadContext(conn, doc.organization_id, doc.learner_id, doc.id);
    // Signature du document (stagiaire/signataire) pour le jeton {Signature stagiaire}.
    ctx.signature = { data: decrypt(doc.signature_data), name: doc.signer_name, date: doc.signed_at };
    // Émargement : rendu par le moteur d'émargement (pas de modèle HTML ni de jetons).
    if (isEmargDoc(doc)) {
        const who = [ctx.learner?.first_name, ctx.learner?.last_name].filter(Boolean).join(' ').trim();
        const baseName = (who ? `${doc.title || "Feuille d'émargement"} - ${who}` : (doc.title || "Feuille d'émargement")).replace(/[\\/:*?"<>|]/g, '');
        return { doc, ctx, slug: doc.template_slug || 'emargement', content: { kind: 'emargement' }, baseName };
    }
    const f = (ctx.formations && ctx.formations[0]) || {};
    // Slug enregistré sur le document en priorité, sinon dérivé du type + contexte.
    const slug = doc.template_slug || templateSlugFor(doc.type, { financing: f.financing, rsCode: f.rs_code, hygiene: !!f.hygiene, jours: f.days });
    if (!slug) { res.status(404).json({ message: 'Aucun modèle pour ce type de document.' }); return null; }
    // Contenu propre à l'organisme s'il existe, sinon modèle par défaut fourni.
    const content = await getTemplateContent(doc.organization_id, slug);
    if (!content) { res.status(404).json({ message: 'Aucun modèle pour cette étape. Créez-le dans Modèles → Éditer.' }); return null; }

    // Contrôle des informations obligatoires : si un jeton du modèle n'a pas de
    // valeur (ex. adresse, entreprise, dates…), on annule et on liste ce qui manque.
    // `?draft=1` permet un aperçu sans blocage.
    const draft = req.query.draft === '1' || req.query.draft === 'true';
    if (!draft && content.kind === 'builder') {
        const missing = findMissingTokens([content.html, content.header, content.footer], ctx);
        if (missing.length) {
            res.status(422).json({
                error: 'Informations manquantes',
                message: `Document non généré : ${missing.length} information(s) manquante(s) dans la fiche.`,
                missing,
            });
            return null;
        }
    }

    const who = [ctx.learner?.first_name, ctx.learner?.last_name].filter(Boolean).join(' ').trim();
    const label = TYPE_LABELS[doc.type] || doc.type || 'document';
    const baseName = (who ? `${doc.title || label} - ${who}` : (doc.title || label)).replace(/[\\/:*?"<>|]/g, '');
    return { doc, ctx, slug, content, baseName };
}

/**
 * GET /api/documents/:id/docx — modèle Word rempli (uniquement pour les modèles .docx hérités).
 */
const downloadDocx = async (req, res) => {
    try {
        const r = await fillForRequest(req, res);
        if (!r) return;
        if (r.content.kind !== 'docx') {
            return res.status(400).json({ message: 'Ce modèle est géré dans l\'éditeur intégré : disponible en PDF.' });
        }
        const out = renderTemplate(r.content.buffer, r.ctx, r.slug);
        logAudit(req, 'document.docx', 'GeneratedDocument', r.doc.id);
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(out.filename)}"`);
        res.send(out.buffer);
    } catch (err) {
        console.error('Erreur génération .docx :', err);
        res.status(500).json({ error: 'Génération du document impossible' });
    }
};

// Construit les octets PDF (NON signés) d'un document à partir de son contenu résolu
// (émargement / éditeur intégré / .docx). Lève EMARG_NOT_READY / NO_SOFFICE au besoin.
async function composeDocPdf(conn, r) {
    if (r.content.kind === 'emargement') {
        const html = await renderEmargDoc(conn, r.doc.organization_id, r.doc, r.ctx);
        if (!html) { const e = new Error('EMARG_NOT_READY'); e.code = 'EMARG_NOT_READY'; throw e; }
        return htmlToPdf(html);
    }
    if (r.content.kind === 'builder') {
        // En-tête + pied de page répétés sur CHAQUE page (superposition pdf-lib).
        return await composeDocumentPdf({
            bodyHtml: r.content.html, ctx: r.ctx,
            headerHtml: r.content.header, footerHtml: r.content.footer,
            bleed: (r.content.layout && r.content.layout.bleed) || {},
        });
    }
    const out = renderTemplate(r.content.buffer, r.ctx, r.slug);
    return docxToPdf(out.buffer);
}

// Certificat de signature du STAGIAIRE (auto-signé, généré + stocké chiffré au 1er usage,
// comme celui de l'organisme). Repli : certificat éphémère si migration 068 non jouée.
async function getLearnerSigner(conn, learnerId, name) {
    const { generateSelfSignedP12 } = require('../lib/pdfseal.js');
    try {
        const [[l]] = await conn.query('SELECT sign_cert FROM learner WHERE id = ?', [learnerId]);
        if (l && l.sign_cert) {
            const b64 = decrypt(l.sign_cert);
            if (b64) return Buffer.from(b64, 'base64');
        }
        const p12 = generateSelfSignedP12(name || 'Stagiaire');
        await conn.query('UPDATE learner SET sign_cert = ? WHERE id = ?', [encrypt(p12.toString('base64')), learnerId]);
        return p12;
    } catch (e) {
        if (e && e.code === 'ER_BAD_FIELD_ERROR') return generateSelfSignedP12(name || 'Stagiaire');
        throw e;
    }
}

// PDF signé « figé » : stockage (chiffré) et lecture. Renvoie null si absent / table non créée.
async function storeSignedPdf(conn, orgId, docId, buffer, count) {
    const enc = encrypt(buffer.toString('base64'));
    await conn.query(
        `INSERT INTO document_signed_pdf (document_id, organization_id, pdf, signer_count)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pdf = VALUES(pdf), signer_count = VALUES(signer_count), organization_id = VALUES(organization_id)`,
        [docId, orgId, enc, count]
    );
}
async function loadSignedPdf(conn, docId) {
    try {
        const [[row]] = await conn.query('SELECT pdf FROM document_signed_pdf WHERE document_id = ?', [docId]);
        if (!row || !row.pdf) return null;
        const b64 = decrypt(row.pdf);
        return b64 ? Buffer.from(b64, 'base64') : null;
    } catch (e) {
        if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR')) return null;
        throw e;
    }
}

// Appose la signature VISIBLE de l'organisme ({Signature organisme}) sur le document,
// depuis la signature enregistrée dans Organisme. Idempotent. Renvoie true si (déjà)
// apposée. L'organisme signe en DERNIER : on l'appelle au moment où une partie signe,
// et non plus à l'envoi.
async function applyOrgVisibleSignature(conn, orgId, docId) {
    try {
        const [[cur]] = await conn.query('SELECT org_signed_at FROM generated_document WHERE id = ?', [docId]);
        if (cur && cur.org_signed_at) return true;
        const [[org]] = await conn.query('SELECT legal_name, short_name, manager, signature_image FROM organization WHERE id = ?', [orgId]);
        const img = decrypt(org && org.signature_image);
        if (!img) return false; // pas de signature d'organisme configurée : sceau seul, sans image
        await conn.query(
            'UPDATE generated_document SET org_signed_at = NOW(), org_signer_name = ?, org_signature_data = ? WHERE id = ?',
            [(org.legal_name || org.short_name || org.manager || 'Organisme'), encrypt(img), docId]);
        return true;
    } catch (e) { if (e && e.code === 'ER_BAD_FIELD_ERROR') return false; throw e; }
}

// Assemble contexte + contenu d'un document pour le SIGNER (sans req/res, sans blocage
// « informations manquantes » : le document a déjà été généré et signé côté stagiaire).
async function assembleDocForSign(conn, orgId, doc) {
    const ctx = await loadContext(conn, orgId, doc.learner_id, doc.id);
    ctx.signature = { data: decrypt(doc.signature_data), name: doc.signer_name, date: doc.signed_at };
    const who = [ctx.learner?.first_name, ctx.learner?.last_name].filter(Boolean).join(' ').trim();
    if (isEmargDoc(doc)) {
        const baseName = (who ? `Émargement - ${who}` : 'Émargement').replace(/[\\/:*?"<>|]/g, '');
        return { doc, ctx, slug: doc.template_slug || 'emargement', content: { kind: 'emargement' }, baseName };
    }
    const f = (ctx.formations && ctx.formations[0]) || {};
    const slug = doc.template_slug || templateSlugFor(doc.type, { financing: f.financing, rsCode: f.rs_code, hygiene: !!f.hygiene, jours: f.days });
    if (!slug) return null;
    const content = await getTemplateContent(orgId, slug);
    if (!content) return null;
    const label = TYPE_LABELS[doc.type] || doc.type || 'document';
    const baseName = (who ? `${doc.title || label} - ${who}` : (doc.title || label)).replace(/[\\/:*?"<>|]/g, '');
    return { doc, ctx, slug, content, baseName };
}

/**
 * Appose les signatures cryptographiques du document (stagiaire PUIS organisme, en
 * incrémental pour ne pas invalider la 1re) et stocke le PDF signé figé. Renvoie le
 * nombre de signatures apposées, ou null si le PDF n'a pas pu être construit.
 */
async function signAndStoreDocument(conn, orgId, doc, signerName) {
    // L'organisme signe APRÈS le stagiaire : on appose sa signature visible juste avant
    // le rendu (elle apparaîtra donc sur un document déjà signé par le stagiaire).
    const orgSteps = await loadOrgSteps(orgId);
    if (orgSignsDoc(orgSteps, doc)) await applyOrgVisibleSignature(conn, orgId, doc.id);
    const r = await assembleDocForSign(conn, orgId, doc);
    if (!r) return null;
    const { signPdf } = require('../lib/pdfseal.js');
    const org = r.ctx.org || {};
    let pdf = await composeDocPdf(conn, r);
    // 1) Signature du STAGIAIRE (certificat à son nom).
    const learnerP12 = await getLearnerSigner(conn, doc.learner_id, signerName);
    pdf = await signPdf(pdf, learnerP12, { name: signerName || 'Stagiaire', reason: 'Signature du stagiaire', incremental: false });
    let count = 1;
    // 2) Contre-signature AUTOMATIQUE de l'organisme (si le modèle prévoit « À signer »),
    //    en mise à jour incrémentale : la signature du stagiaire reste valide.
    try {
        if (orgSignsDoc(orgSteps, doc)) {
            const orgName = org.legal_name || org.short_name || 'Organisme';
            const orgP12 = await getOrgSigner(conn, orgId, orgName);
            pdf = await signPdf(pdf, orgP12, { name: orgName, reason: "Signature de l'organisme", contact: org.email || '', location: org.town || '', incremental: true });
            count = 2;
        }
    } catch (e) { console.error('Contre-signature organisme ignorée :', e.message); }
    await storeSignedPdf(conn, orgId, doc.id, pdf, count);
    return count;
}

/**
 * GET /api/documents/:id/pdf — document final NON MODIFIABLE (PDF) envoyé au client.
 * Rendu fidèle au modèle Word via LibreOffice. Servi « inline » (aperçu + téléchargement).
 */
const downloadPdf = async (req, res) => {
    try {
        const conn = db.promise();
        // Document déjà signé électroniquement : servir le PDF SIGNÉ FIGÉ tel quel.
        // Le régénérer invaliderait les signatures : on ne repasse donc PAS par le rendu
        // ni par le contrôle « informations manquantes ».
        try {
            const [[sdoc]] = await conn.query(
                'SELECT id, organization_id, learner_id, title, type FROM generated_document WHERE id = ? AND organization_id = ?',
                [req.params.id, req.user.organization_id]
            );
            if (sdoc) {
                const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'];
                let allowed = STAFF.includes(req.user.role);
                if (!allowed) {
                    const [own] = await conn.query('SELECT id FROM learner WHERE id = ? AND user_id = ?', [sdoc.learner_id, req.user.id]);
                    allowed = own.length > 0;
                }
                if (allowed) {
                    const stored = await loadSignedPdf(conn, sdoc.id);
                    if (stored) {
                        logAudit(req, 'document.pdf', 'GeneratedDocument', sdoc.id);
                        const base = (sdoc.title || TYPE_LABELS[sdoc.type] || 'document').replace(/[\\/:*?"<>|]/g, '');
                        res.set('Content-Type', 'application/pdf');
                        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(base + '.pdf')}"`);
                        return res.send(stored);
                    }
                }
            }
        } catch (e) { console.error('Lecture du PDF signé ignorée :', e.message); }

        const r = await fillForRequest(req, res);
        if (!r) return;
        let pdf;
        try {
            pdf = await composeDocPdf(conn, r);
        } catch (e) {
            if (e.code === 'EMARG_NOT_READY') return res.status(422).json({ message: "Émargement pas encore disponible : générez d'abord les feuilles de présence de la session." });
            if (e.code === 'NO_SOFFICE') return res.status(501).json({ error: 'PDF indisponible', message: 'LibreOffice n\'est pas installé sur le serveur (nécessaire pour convertir en PDF).' });
            throw e;
        }
        // Document NON encore signé : cachet PAdES de l'organisme à la volée (intégrité).
        try {
            const { sealPdf } = require('../lib/pdfseal.js');
            const org = r.ctx.org || {};
            const p12 = await getOrgSigner(conn, r.doc.organization_id, org.legal_name || org.short_name);
            pdf = await sealPdf(pdf, p12, {
                orgName: org.legal_name || org.short_name || 'Organisme',
                reason: `Document ${r.doc.type} scellé électroniquement`,
                contact: org.email || '', location: org.town || '',
            });
        } catch (e) {
            console.error('Scellement PAdES ignoré :', e.message); // repli : PDF non scellé
        }
        logAudit(req, 'document.pdf', 'GeneratedDocument', r.doc.id);
        const filename = r.baseName + '.pdf';
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
        res.send(pdf);
    } catch (err) {
        console.error('Erreur génération PDF :', err);
        res.status(500).json({ error: 'Génération du PDF impossible' });
    }
};

/**
 * GET /api/documents/:id/preview — aperçu HTML fidèle (même rendu que le PDF),
 * affichable en ligne sans dépendre du lecteur PDF du navigateur.
 */
const previewHtml = async (req, res) => {
    try {
        const r = await fillForRequest(req, res);
        if (!r) return; // 404 / 403 / 422 (informations manquantes) déjà répondus
        let html;
        if (r.content.kind === 'emargement') {
            html = await renderEmargDoc(db.promise(), r.doc.organization_id, r.doc, r.ctx);
            if (!html) return res.status(422).json({ message: "Émargement pas encore disponible : générez d'abord les feuilles de présence de la session." });
        } else if (r.content.kind === 'builder') {
            html = renderTemplateHtml(r.content.html, r.ctx, {
                title: r.doc.title || r.baseName,
                headerHtml: r.content.header, footerHtml: r.content.footer,
            });
        } else {
            return res.status(400).json({ message: 'Aperçu HTML indisponible pour ce modèle (.docx) — utilisez le PDF.' });
        }
        res.json({ data: { html } });
    } catch (err) {
        console.error('Erreur aperçu HTML :', err);
        res.status(500).json({ error: 'Aperçu impossible' });
    }
};

/**
 * Envoie un document préparé (A_FAIRE → ENVOYE). L'organisme n'est apposé à l'envoi que
 * pour les documents SANS partie signataire (org-seul). Réutilisable (envoi de groupe).
 * Renvoie true si envoyé.
 */
async function sendPreparedDoc(conn, orgId, docId) {
    const [[doc]] = await conn.query('SELECT id, type, template_slug, status FROM generated_document WHERE id = ? AND organization_id = ?', [docId, orgId]);
    if (!doc || doc.status !== 'A_FAIRE') return false;
    let orgSet = ''; const orgVals = [];
    try {
        const orgSteps = await loadOrgSteps(orgId);
        const hasParty = stagiaireSignsDoc(orgSteps, doc) || companySignsDoc(orgSteps, doc);
        if (!hasParty && orgSignsDoc(orgSteps, doc)) {
            const [[cur]] = await conn.query('SELECT org_signed_at FROM generated_document WHERE id = ?', [docId]);
            if (!cur || !cur.org_signed_at) {
                const [[org]] = await conn.query('SELECT legal_name, short_name, manager, signature_image FROM organization WHERE id = ?', [orgId]);
                const img = decrypt(org && org.signature_image);
                if (img) { orgSet = ', org_signed_at = NOW(), org_signer_name = ?, org_signature_data = ?'; orgVals.push(org.legal_name || org.short_name || org.manager || 'Organisme', encrypt(img)); }
            }
        }
    } catch (e) { if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; }
    await conn.query(`UPDATE generated_document SET status = 'ENVOYE', sent_at = NOW()${orgSet} WHERE id = ? AND organization_id = ? AND status = 'A_FAIRE'`, [...orgVals, docId, orgId]);
    if (doc.type === 'DEVIS') await advanceEnrollments(conn, orgId, docId, 'DEVIS_ENVOYE');
    else if (doc.type === 'EVALUATION_SATISFACTION') await advanceEnrollments(conn, orgId, docId, 'EVALUATION_ENVOYEE');
    return true;
}

/**
 * POST /api/documents/:id/send — envoie le document au stagiaire (demande de signature).
 */
const sendDocument = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[doc]] = await conn.query(
            'SELECT id, type, template_slug, status FROM generated_document WHERE id = ? AND organization_id = ?',
            [req.params.id, orgId]
        );
        if (!doc || doc.status !== 'A_FAIRE') {
            return res.status(400).json({ message: 'Document déjà envoyé ou introuvable.' });
        }

        // L'ORGANISME signe en DERNIER : à l'envoi, on n'appose sa signature QUE si aucune
        // partie (stagiaire / entreprise) ne doit signer — ex. Invitation, Certificat de
        // réalisation. Sinon l'organisme contresignera automatiquement après la/les partie(s)
        // (cf. applyOrgVisibleSignature au moment de la signature de la partie).
        let orgSet = '';
        const orgVals = [];
        try {
            const orgSteps = await loadOrgSteps(orgId);
            const hasParty = stagiaireSignsDoc(orgSteps, doc) || companySignsDoc(orgSteps, doc);
            if (!hasParty && orgSignsDoc(orgSteps, doc)) {
                const [[cur]] = await conn.query('SELECT org_signed_at FROM generated_document WHERE id = ?', [req.params.id]);
                if (!cur || !cur.org_signed_at) {
                    const [[org]] = await conn.query(
                        'SELECT legal_name, short_name, manager, signature_image FROM organization WHERE id = ?', [orgId]);
                    const img = decrypt(org && org.signature_image);
                    if (!img) {
                        return res.status(422).json({
                            message: "Aucune signature d'organisme enregistrée. Ajoutez-la dans Organisme avant d'envoyer ce document à signer.",
                        });
                    }
                    orgSet = ', org_signed_at = NOW(), org_signer_name = ?, org_signature_data = ?';
                    orgVals.push(org.legal_name || org.short_name || org.manager || 'Organisme', encrypt(img));
                }
            }
        } catch (e) {
            if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; // migration 049 non jouée : envoi sans signature organisme
        }

        await conn.query(
            `UPDATE generated_document SET status = 'ENVOYE', sent_at = NOW()${orgSet}
             WHERE id = ? AND organization_id = ? AND status = 'A_FAIRE'`,
            [...orgVals, req.params.id, orgId]
        );
        // Pipeline : devis envoyé -> « Devis envoyé » ; éval. envoyée -> « Éval. envoyée ».
        if (doc && doc.type === 'DEVIS') await advanceEnrollments(conn, req.user.organization_id, req.params.id, 'DEVIS_ENVOYE');
        else if (doc && doc.type === 'EVALUATION_SATISFACTION') await advanceEnrollments(conn, req.user.organization_id, req.params.id, 'EVALUATION_ENVOYEE');
        logAudit(req, 'document.send', 'GeneratedDocument', req.params.id);
        res.status(200).json({ success: true, message: 'Document envoyé au stagiaire' });
    } catch (err) {
        console.error('Erreur envoi document :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/documents/:id/sign — signature par le stagiaire (ou l'admin).
 * Corps : { signer_name, signature_data }.
 */
const signDocument = async (req, res) => {
    const { signer_name, signature_data } = req.body;
    if (!signer_name) return res.status(422).json({ error: 'Nom du signataire requis.' });
    try {
        const conn = db.promise();
        // Vérifie l'accès : même organisme, et si stagiaire, propriétaire du document.
        const [rows] = await conn.query(
            `SELECT d.id, d.type, d.learner_id, d.template_slug, d.title FROM generated_document d
             LEFT JOIN learner l ON l.id = d.learner_id
             WHERE d.id = ? AND d.organization_id = ?
               AND (l.user_id = ? OR ? IN ('SUPER_ADMIN','ADMIN_ORGANISME','SECRETARIAT'))`,
            [req.params.id, req.user.organization_id, req.user.id, req.user.role]
        );
        if (rows.length === 0) return res.status(403).json({ message: 'Document non autorisé.' });

        // Le document doit être prévu pour signature stagiaire (Modeles : stagiaire_sign).
        // L'émargement est toujours signable électroniquement par le stagiaire.
        const orgSteps = await loadOrgSteps(req.user.organization_id);
        if (!isEmargDoc(rows[0]) && !stagiaireSignsDoc(orgSteps, rows[0]) && !companySignsDoc(orgSteps, rows[0])) {
            return res.status(422).json({ message: "Ce document n'est pas prévu pour être signé par le stagiaire." });
        }
        // Document dont la signature incombe à l'ENTREPRISE : le stagiaire ne le signe pas
        // lui-même (le représentant signe à sa place). Le personnel peut toujours signer.
        const isStaff = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'].includes(req.user.role);
        if (!isStaff && await docSignedByCompany(conn, orgSteps, rows[0])) {
            return res.status(422).json({ message: "Ce document doit être signé par l'entreprise (représentant)." });
        }

        await applyLearnerSignature(conn, req.user.organization_id, rows[0], {
            signerName: signer_name, signatureData: signature_data,
            ip: clientIp(req), userAgent: req.headers['user-agent'] || '',
        });
        logAudit(req, 'document.sign', 'GeneratedDocument', req.params.id);
        notify(req.user.organization_id, {
            type: 'SIGNATURE', title: 'Document signé', body: `Signé par ${signer_name}`,
            link: rows[0].learner_id ? `/stagiaires/${rows[0].learner_id}` : '/suivi',
        });
        res.status(200).json({ success: true, message: 'Document signé' });
    } catch (err) {
        console.error('Erreur signature document :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/documents/:id — supprime le document pour tout le monde (admin + stagiaire).
 * Pour un émargement, retire AUSSI la feuille archivée correspondante (les deux
 * représentations disparaissent — suppression complète).
 */
const deleteDocument = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[doc]] = await conn.query('SELECT id, type, enrollment_id FROM generated_document WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!doc) return res.status(404).json({ message: 'Document introuvable' });
        if (doc.type === 'EMARGEMENT') {
            let enr = doc.enrollment_id;
            if (!enr) { const [[df]] = await conn.query('SELECT enrollment_id FROM document_formation WHERE document_id = ? LIMIT 1', [doc.id]); enr = df && df.enrollment_id; }
            if (enr) await conn.query('DELETE FROM archive_document WHERE organization_id = ? AND (ref = ? OR ref LIKE ?)', [orgId, `emarg:${enr}`, `emarg:${enr}:%`]);
        }
        try { await conn.query('DELETE FROM document_signed_pdf WHERE document_id = ?', [doc.id]); }
        catch (e) { if (!(e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR'))) throw e; }
        await conn.query('DELETE FROM generated_document WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        logAudit(req, 'document.delete', 'GeneratedDocument', req.params.id);
        res.status(200).json({ success: true, message: 'Document supprimé' });
    } catch (err) {
        console.error('Erreur suppression document :', err);
        res.status(400).json({ message: 'Erreur suppression' });
    }
};

// ---- Signature d'un « créneau » (multi-signataires) + lien de signature partageable ----

// Rend le corps HTML d'un document (pour l'aperçu public d'un signataire externe). null si .docx.
async function renderDocumentHtml(conn, orgId, doc) {
    const slug = doc.template_slug;
    const content = slug ? await getTemplateContent(orgId, slug) : null;
    if (!content || content.kind === 'docx' || content.kind === 'emargement') return null;
    const ctx = await loadContext(conn, orgId, doc.learner_id, doc.id);
    return renderTemplateHtml(content.html, ctx, { title: doc.title, headerHtml: content.header, footerHtml: content.footer });
}

/**
 * Enregistre la signature d'un créneau (document_signature) puis re-scelle le PDF
 * (signataire du créneau PUIS organisme, en incrémental) et passe le document à SIGNÉ.
 * Utilisé pour la signature du représentant d'une entreprise via un lien partageable.
 */
async function applySlotSignature(conn, orgId, doc, { slot, label, signerName, signatureData, ip, userAgent }) {
    const hash = crypto.createHash('sha256').update(String(signatureData || '') + doc.id + slot).digest('hex');
    const encSig = encrypt(signatureData || null);
    const [ex] = await conn.query('SELECT id FROM document_signature WHERE document_id = ? AND slot = ?', [doc.id, slot]);
    if (ex.length) {
        await conn.query(
            'UPDATE document_signature SET label = ?, signer_name = ?, signature_data = ?, signer_ip = ?, signer_user_agent = ?, signed_hash = ?, signed_at = NOW() WHERE id = ?',
            [label, signerName, encSig, encrypt(ip || ''), encrypt((userAgent || '').slice(0, 400)), hash, ex[0].id]);
    } else {
        await conn.query(
            `INSERT INTO document_signature (id, organization_id, document_id, slot, label, signer_name, signature_data, signer_ip, signer_user_agent, signed_hash, signed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [crypto.randomUUID(), orgId, doc.id, slot, label, signerName, encSig, encrypt(ip || ''), encrypt((userAgent || '').slice(0, 400)), hash]);
    }
    // Re-scelle le PDF (signataire du créneau + contre-signature organisme).
    const slug = doc.template_slug;
    const content = slug ? await getTemplateContent(orgId, slug) : null;
    if (content && content.kind !== 'emargement') {
        const { signPdf, generateSelfSignedP12 } = require('../lib/pdfseal.js');
        // L'organisme signe en dernier : signature visible apposée avant le rendu.
        const orgSteps = await loadOrgSteps(orgId);
        if (orgSignsDoc(orgSteps, doc)) await applyOrgVisibleSignature(conn, orgId, doc.id);
        const ctx = await loadContext(conn, orgId, doc.learner_id, doc.id);
        let pdf = await composeDocPdf(conn, { doc, ctx, slug, content });
        const repP12 = generateSelfSignedP12(signerName || 'Signataire');
        pdf = await signPdf(pdf, repP12, { name: signerName || 'Signataire', reason: label || 'Signature', incremental: false });
        let count = 1;
        try {
            if (orgSignsDoc(orgSteps, doc)) {
                const org = ctx.org || {};
                const orgName = org.legal_name || org.short_name || 'Organisme';
                const orgP12 = await getOrgSigner(conn, orgId, orgName);
                pdf = await signPdf(pdf, orgP12, { name: orgName, reason: "Signature de l'organisme", contact: org.email || '', location: org.town || '', incremental: true });
                count = 2;
            }
        } catch (e) { console.error('Contre-signature organisme ignorée :', e.message); }
        await storeSignedPdf(conn, orgId, doc.id, pdf, count);
    }
    await conn.query("UPDATE generated_document SET status = 'SIGNE', signed_at = NOW(), signer_name = ? WHERE id = ?", [signerName, doc.id]);
}

/**
 * Applique une signature « stagiaire » sur un document : remplit la case {Signature
 * stagiaire}, passe le document en SIGNÉ, scelle le PDF (cert stagiaire + contreseing
 * organisme) et fait avancer le pipeline. Utilisé par le stagiaire lui-même ET par le
 * représentant de l'entreprise qui signe À LA PLACE du stagiaire (lien de signature).
 */
async function applyLearnerSignature(conn, orgId, doc, { signerName, signatureData, ip, userAgent }) {
    // Empreinte du contenu signé (SHA-256 du HTML rempli) : preuve d'intégrité.
    let signedHash = null;
    try {
        const html = await buildDocHtml(conn, orgId, { ...doc, signature_data: signatureData || null, signer_name: signerName, signed_at: new Date() });
        if (html) signedHash = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
    } catch (e) { console.error('Empreinte signature ignorée :', e.message); }
    await conn.query(
        `UPDATE generated_document
         SET status = 'SIGNE', signed_at = NOW(), signer_name = ?, signature_data = ?,
             signer_ip = ?, signer_user_agent = ?, signed_hash = ?
         WHERE id = ?`,
        [signerName, encrypt(signatureData || null), encrypt(ip || ''), encrypt((userAgent || '').slice(0, 400)), signedHash, doc.id]
    );
    // Signatures cryptographiques (stagiaire + organisme) sur le PDF figé, stockées.
    try {
        const [[full]] = await conn.query('SELECT * FROM generated_document WHERE id = ?', [doc.id]);
        if (full) await signAndStoreDocument(conn, orgId, full, signerName);
    } catch (e) { console.error('Signature cryptographique différée :', e.message); }
    // Pipeline : devis signé -> « Devis signé » ; contrat/convention signé -> « Inscrit ».
    if (doc.type === 'DEVIS') await advanceEnrollments(conn, orgId, doc.id, 'DEVIS_SIGNE');
    else if (doc.type === 'CONTRAT' || doc.type === 'CONVENTION') await advanceEnrollments(conn, orgId, doc.id, 'INSCRIT');
}

/** POST /api/documents/:id/sign-link — crée un lien de signature partageable (créneau). */
const createSignLink = async (req, res) => {
    try {
        const conn = db.promise();
        const [[doc]] = await conn.query('SELECT id FROM generated_document WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!doc) return res.status(404).json({ message: 'Document introuvable.' });
        const slot = String((req.body || {}).slot || 'representant').slice(0, 60);
        const label = String((req.body || {}).label || 'Signature du représentant').slice(0, 120);
        const token = crypto.randomBytes(32).toString('base64url');
        try {
            await conn.query(
                'INSERT INTO document_sign_link (token, organization_id, document_id, slot, label, expires_at) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
                [token, req.user.organization_id, doc.id, slot, label]);
        } catch (e) {
            if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR')) return res.status(422).json({ message: 'Liens de signature non initialisés (migration 078).' });
            throw e;
        }
        logAudit(req, 'document.sign_link', 'GeneratedDocument', doc.id);
        res.status(201).json({ data: { token } });
    } catch (err) {
        console.error('Erreur création lien de signature :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listDocuments, createDocument, checkDocumentConditions, prepareLearnerDoc, getDocument, downloadDocx, downloadPdf, previewHtml, sendDocument, sendPreparedDoc, signDocument, deleteDocument, createSignLink, renderDocumentHtml, applySlotSignature, applyLearnerSignature, clientIp };
