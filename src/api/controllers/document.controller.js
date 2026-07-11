const crypto = require('crypto');
const db = require('../config/database.js');
const { renderDocumentHTML } = require('../lib/render.js');
const { templateSlugFor, renderTemplate } = require('../lib/docxfill.js');
const { getTemplateContent, loadOrgSteps } = require('./template.controller.js');
const { stagiaireSignsDoc, orgSignsDoc } = require('../lib/documents.js');
const { renderTemplateHtml } = require('../lib/htmlfill.js');
const { composeDocumentPdf } = require('../lib/pdfcompose.js');
const { findMissingTokens } = require('../lib/tokens.js');
const { docxToPdf, htmlToPdf } = require('../lib/docxpdf.js');
const { buildEmargementDocHtml } = require('../lib/emargement.js');
const { logAudit } = require('../lib/audit.js');
const { encrypt, decrypt } = require('../lib/crypto.js');
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
    const [[learner]] = await conn.query('SELECT * FROM learner WHERE id = ?', [learnerId]);
    let company = null;
    const [formations] = await conn.query(
        `SELECT p.code, p.title, p.days, p.hours, p.price, p.hygiene, p.rs_code AS rs_code,
                p.audience, p.objectives, p.objective_general, p.duration_detail, p.program_detail,
                s.year, s.week,
                DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                e.financing, e.price AS enroll_price, e.acompte
         FROM document_formation df
         JOIN enrollment e ON e.id = df.enrollment_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         WHERE df.document_id = ?`,
        [documentId]
    );
    const isPro = formations.some((f) => f.financing === 'PROFESSIONNEL');
    if (isPro && learner && learner.company_id) {
        const [cRows] = await conn.query('SELECT * FROM company WHERE id = ?', [learner.company_id]);
        company = cRows[0] || null;
    }
    // Signatures multiples (jetons sig:<slot>) — chargées si la table existe (migration 061).
    const slotSignatures = {};
    if (documentId) {
        try {
            const [sigs] = await conn.query('SELECT slot, label, signature_data, signer_name, signed_at FROM document_signature WHERE document_id = ?', [documentId]);
            for (const s of sigs) slotSignatures[s.slot] = { data: decrypt(s.signature_data), name: s.signer_name, date: s.signed_at, label: s.label };
        } catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; }
    }
    return { org: org || {}, learner: learner || {}, company, formations, slotSignatures };
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

        // Régénérer une étape REMPLACE sa version en attente (non signée) pour ces
        // dossiers : évite les doublons qui faussent le parcours. Les documents déjà
        // signés sont conservés.
        const [dups] = await conn.query(
            `SELECT DISTINCT gd.id FROM generated_document gd
             JOIN document_formation df ON df.document_id = gd.id
             WHERE gd.organization_id = ? AND df.enrollment_id IN (?)
               AND gd.status <> 'SIGNE'
               AND (${template_slug ? 'gd.template_slug = ?' : 'gd.type = ?'})`,
            [orgId, enrollment_ids, template_slug || type]
        );
        for (const d of dups) {
            await conn.query('DELETE FROM generated_document WHERE id = ? AND organization_id = ?', [d.id, orgId]);
        }

        const documentId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO generated_document (id, organization_id, learner_id, type, template_slug, title, status)
             VALUES (?, ?, ?, ?, ?, ?, 'A_FAIRE')`,
            [documentId, orgId, learner_id, type, template_slug || null, title || TYPE_LABELS[type] || type]
        );
        for (const eid of enrollment_ids) {
            await conn.query(
                'INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)',
                [documentId, eid]
            );
        }
        // Pipeline : la fiche d'expression fait passer le dossier à « Contacté ».
        if (type === 'FICHE_SEMAINE') await advanceEnrollments(conn, req.user.organization_id, documentId, 'CONTACTE');
        res.status(201).json({ message: 'Document préparé', id: documentId });
    } catch (err) {
        console.error('Erreur création document :', err);
        res.status(500).json({ error: 'Internal Server Error' });
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
        res.json({
            data: {
                id: doc.id, type: doc.type, title: doc.title, status: doc.status,
                sent_at: doc.sent_at, signed_at: doc.signed_at, signer_name: doc.signer_name,
                signature_data: decrypt(doc.signature_data),
                signable: isEmargDoc(doc) || stagiaireSignsDoc(orgSteps, doc),
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

/**
 * GET /api/documents/:id/pdf — document final NON MODIFIABLE (PDF) envoyé au client.
 * Rendu fidèle au modèle Word via LibreOffice. Servi « inline » (aperçu + téléchargement).
 */
const downloadPdf = async (req, res) => {
    try {
        const r = await fillForRequest(req, res);
        if (!r) return;
        let pdf;
        try {
            if (r.content.kind === 'emargement') {
                const html = await renderEmargDoc(db.promise(), r.doc.organization_id, r.doc, r.ctx);
                if (!html) return res.status(422).json({ message: "Émargement pas encore disponible : générez d'abord les feuilles de présence de la session." });
                pdf = htmlToPdf(html);
            } else if (r.content.kind === 'builder') {
                // En-tête + pied de page répétés sur CHAQUE page (superposition pdf-lib).
                pdf = await composeDocumentPdf({
                    bodyHtml: r.content.html, ctx: r.ctx,
                    headerHtml: r.content.header, footerHtml: r.content.footer,
                    bleed: (r.content.layout && r.content.layout.bleed) || {},
                });
            } else {
                const out = renderTemplate(r.content.buffer, r.ctx, r.slug);
                pdf = docxToPdf(out.buffer);
            }
        } catch (e) {
            if (e.code === 'NO_SOFFICE') {
                return res.status(501).json({ error: 'PDF indisponible', message: 'LibreOffice n\'est pas installé sur le serveur (nécessaire pour convertir en PDF).' });
            }
            throw e;
        }
        // Cachet PAdES de l'organisme : rend le PDF infalsifiable + vérifiable (intégrité).
        try {
            const { sealPdf } = require('../lib/pdfseal.js');
            const conn = db.promise();
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

        // Signature de l'organisme AVANT envoi : appliquée automatiquement avec la
        // signature enregistrée, uniquement si le modèle prévoit « À signer ».
        let orgSet = '';
        const orgVals = [];
        try {
            const orgSteps = await loadOrgSteps(orgId);
            if (orgSignsDoc(orgSteps, doc)) {
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
        if (!isEmargDoc(rows[0]) && !stagiaireSignsDoc(orgSteps, rows[0])) {
            return res.status(422).json({ message: "Ce document n'est pas prévu pour être signé par le stagiaire." });
        }

        // Empreinte du contenu signé (SHA-256 du HTML rempli, signature incluse) : preuve
        // que CE contenu précis a été signé (le document ne peut plus être modifié après coup).
        let signedHash = null;
        try {
            const html = await buildDocHtml(conn, req.user.organization_id, {
                ...rows[0], signature_data: signature_data || null, signer_name, signed_at: new Date(),
            });
            if (html) signedHash = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
        } catch (e) { console.error('Empreinte signature ignorée :', e.message); }

        await conn.query(
            `UPDATE generated_document
             SET status = 'SIGNE', signed_at = NOW(), signer_name = ?, signature_data = ?,
                 signer_ip = ?, signer_user_agent = ?, signed_hash = ?
             WHERE id = ?`,
            [signer_name, encrypt(signature_data || null), encrypt(clientIp(req)), encrypt((req.headers['user-agent'] || '').slice(0, 400)), signedHash, req.params.id]
        );
        // Pipeline : devis signé -> « Devis signé » ; contrat/convention signé -> « Inscrit ».
        if (rows[0].type === 'DEVIS') await advanceEnrollments(conn, req.user.organization_id, req.params.id, 'DEVIS_SIGNE');
        else if (rows[0].type === 'CONTRAT' || rows[0].type === 'CONVENTION') await advanceEnrollments(conn, req.user.organization_id, req.params.id, 'INSCRIT');
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
        await conn.query('DELETE FROM generated_document WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        logAudit(req, 'document.delete', 'GeneratedDocument', req.params.id);
        res.status(200).json({ success: true, message: 'Document supprimé' });
    } catch (err) {
        console.error('Erreur suppression document :', err);
        res.status(400).json({ message: 'Erreur suppression' });
    }
};

module.exports = { listDocuments, createDocument, getDocument, downloadDocx, downloadPdf, previewHtml, sendDocument, signDocument, deleteDocument };
