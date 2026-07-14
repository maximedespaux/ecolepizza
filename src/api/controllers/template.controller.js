const crypto = require('crypto');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { defaultTemplateBuffer } = require('../lib/docxfill.js');
const { mergeSteps, stepsToDocSet, DEFAULT_SLUGS, SIGNER_ROLES, stepSigners } = require('../lib/documents.js');
const { TOKEN_CATALOG, signatureBox } = require('../lib/tokens.js');
const { decrypt } = require('../lib/crypto.js');
const { composeDocumentPdf, computeReserves } = require('../lib/pdfcompose.js');
const { getEnabledFields } = require('../lib/conditions.js');
const { resolveCustomTokens } = require('../lib/customtokens.js');

// Colonnes de métadonnées d'étape lues depuis document_template.
const META_COLS = 'slug, label, doc_type, kind, sort_order, signable, stagiaire_sign, applies_when, active, deleted';

// Lit les lignes document_template d'un organisme (métadonnées + présence de contenu).
// `company_level` (migration 077) est optionnel : on réessaie sans si la colonne manque.
async function loadRows(organizationId) {
    const sel = (extra) =>
        `SELECT ${META_COLS}${extra}, name, (file IS NOT NULL) AS has_file, (body_html IS NOT NULL) AS has_body,
                DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
         FROM document_template WHERE organization_id = ?`;
    // Colonnes optionnelles (migrations 077 / 086 / 087 / 088) : on retombe en cascade si absentes.
    for (const extra of [', company_level, company_sign, signers', ', company_level, company_sign', ', company_level', '']) {
        try { const [rows] = await db.promise().query(sel(extra), [organizationId]); return rows; }
        catch (e) { if (!e || e.code !== 'ER_BAD_FIELD_ERROR') throw e; }
    }
    return [];
}

/**
 * Contenu de rendu pour un organisme + slug.
 * Renvoie { kind:'builder', html } (corps propre ou défaut) ou
 * { kind:'docx', buffer } (ancien mode fichier), ou null si aucune source.
 */
async function getTemplateContent(organizationId, slug) {
    let rows;
    try {
        [rows] = await db.promise().query(
            'SELECT kind, body_html, header_html, footer_html, layout, file FROM document_template WHERE organization_id = ? AND slug = ? LIMIT 1',
            [organizationId, slug]
        );
    } catch (e) {
        if (e && e.code === 'ER_BAD_FIELD_ERROR') { // colonne layout absente (migration 065)
            [rows] = await db.promise().query(
                'SELECT kind, body_html, header_html, footer_html, file FROM document_template WHERE organization_id = ? AND slug = ? LIMIT 1',
                [organizationId, slug]
            );
        } else { throw e; }
    }
    const row = rows[0];
    if (row) {
        let layout = null;
        if (row.layout) { try { layout = typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout; } catch { layout = null; } }
        if (row.kind === 'docx') {
            if (row.file) return { kind: 'docx', buffer: row.file };
        } else if (row.body_html) {
            return { kind: 'builder', html: row.body_html, header: row.header_html || '', footer: row.footer_html || '', layout };
        }
    }
    // Aucun modèle par défaut : le modèle doit être créé dans l'éditeur.
    return null;
}

/** Étapes de l'organisme (défauts fusionnés avec ses lignes) — objets normalisés. */
async function loadOrgSteps(organizationId) {
    return mergeSteps(await loadRows(organizationId));
}

/** Jeu de documents applicable à un dossier pour cet organisme. */
async function documentSetForOrg(organizationId, ctx) {
    return stepsToDocSet(await loadOrgSteps(organizationId), ctx);
}

/**
 * Contenu du modèle (Buffer) pour un organisme + slug : fichier propre s'il
 * existe, sinon modèle par défaut fourni. null si aucune source.
 */
async function getTemplateBuffer(organizationId, slug) {
    const [rows] = await db.promise().query(
        'SELECT file FROM document_template WHERE organization_id = ? AND slug = ? LIMIT 1',
        [organizationId, slug]
    );
    if (rows.length && rows[0].file) return rows[0].file; // Buffer
    return defaultTemplateBuffer(slug);
}

/** GET /api/templates — liste des étapes/modèles (statut + métadonnées). */
const listTemplates = async (req, res) => {
    try {
        const rows = await loadRows(req.user.organization_id);
        const raw = Object.fromEntries(rows.map((r) => [r.slug, r]));
        const steps = mergeSteps(rows).map((s) => ({
            ...s,
            kind: raw[s.slug]?.kind || 'builder',
            has_body: !!raw[s.slug]?.has_body,
            has_file: !!raw[s.slug]?.has_file,
            file_name: raw[s.slug]?.name || null,
            updated_at: raw[s.slug]?.updated_at || null,
            company_sign: raw[s.slug]?.company_sign ? 1 : 0,
            signers: stepSigners(s), // liste résolue (JSON `signers` ou dérivée des drapeaux)
        }));
        res.json({ data: steps });
    } catch (err) {
        console.error('Erreur liste modèles :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Upsert d'une ligne (métadonnées et/ou fichier). Renvoie l'id.
async function upsertTemplate(conn, orgId, slug, fields) {
    const [ex] = await conn.query('SELECT id FROM document_template WHERE organization_id = ? AND slug = ?', [orgId, slug]);
    // Colonnes récentes potentiellement absentes (migration non jouée) : on réessaie
    // sans elles plutôt que d'échouer.
    const OPTIONAL = ['layout', 'company_level', 'company_sign', 'signers'];
    const run = async (f) => {
        const keys = Object.keys(f);
        if (ex.length) {
            if (keys.length) {
                await conn.query(`UPDATE document_template SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
                    [...keys.map((k) => f[k]), ex[0].id]);
            }
            return ex[0].id;
        }
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO document_template (id, organization_id, slug, ${keys.join(', ')}) VALUES (?, ?, ?, ${keys.map(() => '?').join(', ')})`,
            [id, orgId, slug, ...keys.map((k) => f[k])]
        );
        return id;
    };
    try {
        return await run(fields);
    } catch (e) {
        if (e && e.code === 'ER_BAD_FIELD_ERROR' && OPTIONAL.some((k) => k in fields)) {
            const f = { ...fields };
            for (const k of OPTIONAL) delete f[k];
            return run(f);
        }
        throw e;
    }
}

/**
 * PUT /api/templates/:slug — crée/modifie une étape (métadonnées, sans fichier).
 * Corps : { label, doc_type, sort_order, signable, stagiaire_sign, applies_when, active }.
 */
const saveTemplate = async (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!slug) return res.status(422).json({ error: 'Identifiant (slug) requis.' });
    const b = req.body || {};
    const fields = {};
    if (b.label !== undefined) fields.label = b.label ? String(b.label).slice(0, 255) : null;
    if (b.doc_type !== undefined) fields.doc_type = b.doc_type ? String(b.doc_type).toUpperCase().slice(0, 40) : null;
    if (b.sort_order !== undefined) fields.sort_order = Number(b.sort_order) || 100;
    // Nouveau modèle : liste de signataires. On l'enregistre ET on synchronise les
    // anciens drapeaux (rétro-compat pour tout code qui les lit encore directement).
    if (Array.isArray(b.signers)) {
        const list = b.signers.filter((r) => SIGNER_ROLES.includes(r));
        fields.signers = JSON.stringify(list);
        fields.signable = list.includes('ORG') ? 1 : 0;
        fields.stagiaire_sign = list.includes('STAGIAIRE') ? 1 : 0;
        fields.company_sign = list.includes('ENTREPRISE') ? 1 : 0;
    }
    if (b.signable !== undefined) fields.signable = b.signable ? 1 : 0;
    if (b.stagiaire_sign !== undefined) fields.stagiaire_sign = b.stagiaire_sign ? 1 : 0;
    if (b.applies_when !== undefined) fields.applies_when = b.applies_when ? JSON.stringify(b.applies_when) : null;
    if (b.active !== undefined) fields.active = b.active ? 1 : 0;
    if (b.company_level !== undefined) fields.company_level = b.company_level ? 1 : 0;
    if (b.company_sign !== undefined) fields.company_sign = b.company_sign ? 1 : 0;
    // Corps construit dans l'éditeur : passe l'étape en mode « builder ».
    if (b.body_html !== undefined) { fields.body_html = b.body_html || null; fields.kind = 'builder'; }
    if (b.header_html !== undefined) { fields.header_html = b.header_html || null; fields.kind = 'builder'; }
    if (b.footer_html !== undefined) { fields.footer_html = b.footer_html || null; fields.kind = 'builder'; }
    if (b.kind !== undefined && (b.kind === 'builder' || b.kind === 'docx')) fields.kind = b.kind;
    // Réglages de mise en page (bord à bord par zone…). Passe aussi en mode builder.
    if (b.layout !== undefined) { fields.layout = b.layout ? JSON.stringify(b.layout) : null; fields.kind = fields.kind || 'builder'; }
    try {
        await upsertTemplate(db.promise(), req.user.organization_id, slug, fields);
        logAudit(req, 'template.save', 'DocumentTemplate', slug);
        res.status(200).json({ success: true, message: 'Étape enregistrée' });
    } catch (err) {
        console.error('Erreur enregistrement étape :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Échantillon d'aperçu RÉALISTE selon le type et le NOM de colonne (pas le libellé, qui
// afficherait « Intitulé de la formation » au lieu d'une vraie valeur d'exemple).
function sampleForField(f) {
    if (f.type === 'bool') return 'Oui';
    if (f.type === 'enum') return (f.options && f.options[0] && f.options[0].value) || 'Valeur';
    const c = String(f.column || '').toLowerCase();
    if (f.type === 'number') {
        if (/price|amount|montant|prix|acompte|cpf|reste|total/.test(c)) return '1 500';
        if (/day|jour/.test(c)) return '5';
        if (/hour|heure/.test(c)) return '35';
        if (/week|semaine/.test(c)) return '23';
        if (/year|annee|an\b/.test(c)) return '2025';
        if (/age/.test(c)) return '30';
        return '123';
    }
    if (/first_?name|prenom/.test(c)) return 'Jean';
    if (/(company|entreprise|societe|raison)/.test(c)) return 'Pizza Napoli SARL';
    if (/last_?name|nom/.test(c)) return 'Dupont';
    if (/civilit|gender|sexe/.test(c)) return 'M.';
    if (/(intitul|titre|title|program|formation|libell)/.test(c)) return 'Fabriquer des pizzas artisanales';
    if (/(email|mail|courriel)/.test(c)) return 'jean.dupont@email.fr';
    if (/(phone|tel|mobile|portable|gsm)/.test(c)) return '06 12 34 56 78';
    if (/(address|adresse|rue|voie)/.test(c)) return '12 rue des Fours';
    if (/(city|ville|town|commune)/.test(c)) return 'Bordeaux';
    if (/(zip|postal|cp\b)/.test(c)) return '33000';
    if (/siret/.test(c)) return '123 456 789 00012';
    if (/(naf|ape)/.test(c)) return '5610C';
    if (/opco/.test(c)) return 'AKTO';
    if (/(code|rs_)/.test(c)) return 'RS7404';
    if (/(date|birth|naissance|debut|fin|jour1)/.test(c)) return '02/06/2025';
    if (/(status|statut)/.test(c)) return "Demandeur d'emploi";
    if (/(financ)/.test(c)) return 'CPF';
    if (/(objectif|programme|deroul|contenu)/.test(c)) return 'Maîtriser la pâte, la cuisson…';
    if (/(audience|public)/.test(c)) return 'Tout public';
    if (/level|niveau/.test(c)) return 'Débutant';
    return 'Exemple';
}

async function loadOrgRow(orgId) {
    const [[org]] = await db.promise().query('SELECT * FROM organization WHERE id = ?', [orgId]);
    return org || {};
}

// Champs du LIEU de formation (jetons field:location.<colonne>), remplis au rendu depuis
// le lieu de la session du dossier. Échantillons génériques pour l'aperçu.
const LOCATION_FIELDS = [
    ['name', 'Nom du lieu', 'Centre de formation Bordeaux'],
    ['address', 'Adresse du lieu', '12 rue des Fours'],
    ['zip_code', 'Code postal du lieu', '33000'],
    ['town', 'Ville du lieu', 'Bordeaux'],
];

// Jetons de la palette = CHAMPS DOCUMENTS activés (colonnes du dossier), regroupés par table.
// Clé « field:<table.column> », remplie au rendu depuis le dossier réel.
async function fieldTokenGroups(orgId) {
    const fields = await getEnabledFields(db.promise(), orgId);
    const by = {};
    for (const f of fields) {
        // La signature de l'organisme (type image) utilise le jeton intégré « Signature
        // organisme » (image insérée au rendu), pas un simple jeton texte field:….
        const isSig = f.type === 'image' && f.column === 'signature_image';
        const key = isSig ? 'Signature organisme' : `field:${f.key}`;
        const sample = isSig ? '✍ (image enregistrée)' : sampleForField(f);
        (by[f.tableLabel] || (by[f.tableLabel] = [])).push({ key, label: f.label, sample });
    }
    return Object.entries(by).map(([group, tokens]) => ({ group, tokens }));
}

// Groupe « Calculé / dates » : jetons INTÉGRÉS dérivés du dossier (dates de session,
// semaine, durées…). Ils sont calculés au rendu par resolveTokens.
const COMPUTED_KEYS = ['Jour1', 'endDate', 'Semaine', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Formateur', 'Heures', 'Jours', 'DuréeDétail', 'Prix', 'Acompte', 'Financement'];
function computedGroup() {
    const byKey = {};
    for (const g of TOKEN_CATALOG) for (const t of (g.tokens || [])) byKey[t.key] = t;
    const tokens = COMPUTED_KEYS.map((k) => byKey[k]).filter(Boolean).map((t) => ({ key: t.key, label: t.label, sample: t.sample || '' }));
    return { group: 'Calculé / dates', tokens };
}

// Jetons « groupe entreprise » intégrés (non issus d'une colonne du dossier) : la liste
// des stagiaires du groupe {Stagiaires}, insérable dans un modèle « Document entreprise ».
function groupTokensGroup() {
    const byKey = {};
    for (const g of TOKEN_CATALOG) for (const t of (g.tokens || [])) byKey[t.key] = t;
    const tokens = ['Stagiaires'].map((k) => byKey[k]).filter(Boolean)
        .map((t) => ({ key: t.key, label: t.label, sample: t.sample || '' }));
    return { group: 'Groupe entreprise', tokens };
}

// Jetons personnalisés de l'organisme (table custom_token). Résilient si migration absente.
async function loadCustomTokens(orgId) {
    try {
        const [rows] = await db.promise().query(
            'SELECT token_key, label, template, sort_order FROM custom_token WHERE organization_id = ? ORDER BY sort_order, label', [orgId]);
        return rows;
    } catch (e) { if (e && e.code === 'ER_NO_SUCH_TABLE') return []; throw e; }
}

// Ordre d'affichage canonique des groupes de la palette (du plus utile au plus rare).
// Les groupes non listés tombent à la fin, triés alphabétiquement.
const GROUP_ORDER = [
    'Stagiaire', 'Entreprise', 'Groupe entreprise', 'Financeur (OPCO)',
    'Inscription', 'Formation', 'Session', 'Lieu de formation',
    'Organisme', 'Calculé / dates', 'Personnalisés',
];
// Groupes dont l'ORDRE des jetons est déjà réfléchi (ne pas trier alphabétiquement).
const CURATED_GROUPS = new Set(['Calculé / dates', 'Groupe entreprise']);

// Groupes de jetons cachés selon le TYPE de document :
//  - Document ENTREPRISE (company_level=1) : pas de stagiaire unique → on masque les
//    jetons propres à UN stagiaire / une inscription (on garde {Stagiaires} du groupe).
//  - Document STAGIAIRE (company_level=0) : la liste {Stagiaires} n'a pas de sens → on
//    masque le groupe « Groupe entreprise ».
const HIDDEN_FOR_COMPANY = new Set(['Stagiaire', 'Inscription']);
const HIDDEN_FOR_LEARNER = new Set(['Groupe entreprise']);

/** GET /api/templates/tokens?slug= — jetons de la palette, filtrés selon le type de document. */
const getTokens = async (req, res) => {
    try {
        const orgId = req.user.organization_id;
        // Type du modèle en cours d'édition (résilient si la colonne/table manque).
        let companyLevel = null; // null = type inconnu → tout afficher
        if (req.query.slug) {
            try {
                const [[t]] = await db.promise().query(
                    'SELECT company_level FROM document_template WHERE organization_id = ? AND slug = ? LIMIT 1',
                    [orgId, String(req.query.slug)]);
                if (t) companyLevel = t.company_level ? 1 : 0;
            } catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; }
        }
        const groups = await fieldTokenGroups(orgId);
        // (Le groupe « Organisme » — dont la signature — vient des Champs documents.)
        groups.push({ group: 'Lieu de formation', tokens: LOCATION_FIELDS.map(([col, label, sample]) => ({ key: `field:location.${col}`, label, sample })) });
        groups.push(computedGroup());
        groups.push(groupTokensGroup());
        const defs = await loadCustomTokens(orgId);
        if (defs.length) groups.push({ group: 'Personnalisés', tokens: defs.map((d) => ({ key: `custom:${d.token_key}`, label: d.label, sample: '' })) });

        // Réorganisation : ordre de groupes canonique + tri alphabétique des jetons
        // (hors groupes curatés) + suppression des groupes vides.
        const rank = (g) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? GROUP_ORDER.length : i; };
        groups.sort((a, b) => rank(a.group) - rank(b.group) || a.group.localeCompare(b.group, 'fr'));
        for (const g of groups) {
            if (!CURATED_GROUPS.has(g.group) && Array.isArray(g.tokens)) {
                g.tokens.sort((x, y) => String(x.label || '').localeCompare(String(y.label || ''), 'fr'));
            }
        }
        // Filtrage selon le type de document (si connu).
        const hidden = companyLevel === 1 ? HIDDEN_FOR_COMPANY : companyLevel === 0 ? HIDDEN_FOR_LEARNER : null;
        const visible = hidden ? groups.filter((g) => !hidden.has(g.group)) : groups;
        res.json({ data: visible.filter((g) => g.tokens && g.tokens.length) });
    } catch (e) {
        console.error('Erreur jetons palette :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Valeurs d'exemple { clé: échantillon } pour l'aperçu (intégrés + champs documents + personnalisés).
async function sampleTokenValues(orgId) {
    const m = {};
    for (const g of TOKEN_CATALOG) for (const t of (g.tokens || [])) m[t.key] = t.sample || '';
    try { for (const g of await fieldTokenGroups(orgId)) for (const t of g.tokens) m[t.key] = t.sample || ''; }
    catch { /* champs indisponibles : on garde les jetons intégrés */ }
    // Aperçu des champs Organisme : valeurs RÉELLES de la fiche organisme (plutôt qu'un exemple générique).
    try {
        const org = await loadOrgRow(orgId);
        for (const k of Object.keys(m)) {
            if (!k.startsWith('field:organization.')) continue;
            const col = k.slice('field:organization.'.length);
            if (org[col] != null && org[col] !== '') m[k] = String(org[col]);
        }
        // Signature de l'organisme : vraie image si enregistrée, sinon emplacement.
        if (org.signature_image) m['Signature organisme'] = signatureBox(decrypt(org.signature_image), "Signature de l'organisme");
    } catch { /* organisme indisponible */ }
    for (const [col, , sample] of LOCATION_FIELDS) m[`field:location.${col}`] = sample;
    try { Object.assign(m, resolveCustomTokens(await loadCustomTokens(orgId), m)); }
    catch { /* jetons personnalisés indisponibles */ }
    return m;
}

/** GET /api/templates/custom-tokens — liste des jetons personnalisés. */
const getCustomTokens = async (req, res) => {
    try { res.json({ data: await loadCustomTokens(req.user.organization_id) }); }
    catch (e) { console.error('Erreur lecture jetons personnalisés :', e); res.status(500).json({ error: 'Internal Server Error' }); }
};

/** PUT /api/templates/custom-tokens — remplace la liste { tokens: [{ token_key, label, template }] }. */
const saveCustomTokens = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const list = Array.isArray(req.body && req.body.tokens) ? req.body.tokens : [];
        const clean = [];
        const seen = new Set();
        for (let i = 0; i < list.length; i++) {
            const t = list[i] || {};
            const key = String(t.token_key || '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            clean.push({ token_key: key, label: String(t.label || key).slice(0, 120), template: String(t.template || '').slice(0, 2000), sort_order: i * 10 });
        }
        try {
            await conn.query('DELETE FROM custom_token WHERE organization_id = ?', [orgId]);
            for (const t of clean) {
                await conn.query('INSERT INTO custom_token (id, organization_id, token_key, label, template, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                    [crypto.randomUUID(), orgId, t.token_key, t.label, t.template, t.sort_order]);
            }
        } catch (e) {
            if (e && e.code === 'ER_NO_SUCH_TABLE') return res.status(501).json({ message: "La table des jetons personnalisés n'existe pas (migration 066 non appliquée)." });
            throw e;
        }
        logAudit(req, 'template.customTokens', 'Organization', orgId);
        res.json({ success: true, message: 'Jetons personnalisés enregistrés.' });
    } catch (e) {
        console.error('Erreur enregistrement jetons personnalisés :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/templates/:slug/preview-pdf — aperçu PDF FIDÈLE du modèle en cours d'édition.
 * Reçoit le HTML vivant (corps/en-tête/pied), remplit les jetons avec des valeurs
 * d'exemple, et rend le PDF avec en-tête + pied répétés sur chaque page. Renvoie le PDF.
 */
const previewPdf = async (req, res) => {
    try {
        const { body_html, header_html, footer_html, layout } = req.body || {};
        const [[org]] = await db.promise().query('SELECT * FROM organization WHERE id = ?', [req.user.organization_id]);
        const pdf = await composeDocumentPdf({
            bodyHtml: body_html || '<p></p>',
            headerHtml: header_html, footerHtml: footer_html,
            ctx: { org: org || {} },
            sampleValues: await sampleTokenValues(req.user.organization_id),
            bleed: (layout && layout.bleed) || {},
        });
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', 'inline; filename="apercu.pdf"');
        res.send(pdf);
    } catch (e) {
        if (e.code === 'NO_SOFFICE') {
            return res.status(501).json({ message: "LibreOffice n'est pas installé sur le serveur (nécessaire pour l'aperçu PDF)." });
        }
        console.error('Erreur aperçu PDF modèle :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/templates/:slug/page-metrics — marges réservées (en-tête/pied) du modèle en
 * cours d'édition, calculées EXACTEMENT comme le rendu PDF. Sert à placer le repère de fin
 * de page dans l'éditeur. Calcul pur (pas de LibreOffice) → rapide.
 */
const pageMetrics = async (req, res) => {
    try {
        const { body_html, header_html, footer_html, layout } = req.body || {};
        const [[org]] = await db.promise().query('SELECT * FROM organization WHERE id = ?', [req.user.organization_id]);
        const m = computeReserves({
            headerHtml: header_html, footerHtml: footer_html,
            ctx: { org: org || {} },
            sampleValues: await sampleTokenValues(req.user.organization_id),
            bleed: (layout && layout.bleed) || {},
        });
        res.json({ data: m });
    } catch (e) {
        console.error('Erreur métriques page :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/templates/:slug/body — corps HTML du modèle (propre à l'organisme ou défaut). */
const getTemplateBody = async (req, res) => {
    try {
        const content = await getTemplateContent(req.user.organization_id, req.params.slug);
        if (!content) return res.json({ data: { slug: req.params.slug, kind: 'builder', body_html: '', header_html: '', footer_html: '', layout: null } });
        if (content.kind === 'docx') {
            // Ancien modèle .docx sans corps éditable : on renvoie un corps vide à composer.
            return res.json({ data: { slug: req.params.slug, kind: 'docx', body_html: '', header_html: '', footer_html: '', layout: null } });
        }
        res.json({ data: { slug: req.params.slug, kind: 'builder', body_html: content.html, header_html: content.header || '', footer_html: content.footer || '', layout: content.layout || null } });
    } catch (err) {
        console.error('Erreur lecture corps modèle :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/templates/:slug — téléverse (remplace) le fichier .docx de l'étape. */
const uploadTemplate = async (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!slug) return res.status(422).json({ error: 'Identifiant (slug) requis.' });
    if (!req.file || !req.file.buffer) return res.status(422).json({ error: 'Fichier .docx requis.' });
    const name = req.file.originalname || '';
    if (!/\.docx$/i.test(name)) return res.status(422).json({ error: 'Le fichier doit être un .docx.' });
    // Vérifie la signature ZIP (un .docx est un conteneur OOXML = archive ZIP « PK »).
    const b = req.file.buffer;
    if (b.length < 4 || b[0] !== 0x50 || b[1] !== 0x4b) {
        return res.status(422).json({ error: 'Fichier .docx invalide (format inattendu).' });
    }

    try {
        const zip = new PizZip(b);
        // Garde-fou anti « zip bomb » : borne la taille décompressée et le nombre
        // d'entrées avant tout rendu (un .docx légitime reste petit).
        const MAX_UNCOMPRESSED = 80 * 1024 * 1024; // 80 Mo
        const MAX_ENTRIES = 500;
        let totalUnc = 0, entries = 0;
        for (const key of Object.keys(zip.files)) {
            entries++;
            if (entries > MAX_ENTRIES) return res.status(422).json({ error: 'Archive .docx trop complexe.' });
            const data = zip.files[key]?._data;
            const size = (data && (data.uncompressedSize ?? data.length)) || 0;
            totalUnc += size;
            if (totalUnc > MAX_UNCOMPRESSED) return res.status(422).json({ error: 'Archive .docx trop volumineuse une fois décompressée.' });
        }
        const doc = new Docxtemplater(zip, { delimiters: { start: '{', end: '}' }, paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
        doc.render({});
    } catch (e) {
        const first = e.properties && e.properties.errors && e.properties.errors[0];
        return res.status(422).json({ error: 'Modèle .docx invalide', detail: first ? (first.properties?.explanation || first.message) : e.message });
    }

    try {
        await upsertTemplate(db.promise(), req.user.organization_id, slug, {
            file: req.file.buffer, name, mime: req.file.mimetype || null,
        });
        logAudit(req, 'template.upload', 'DocumentTemplate', slug);
        res.status(201).json({ success: true, message: 'Modèle enregistré' });
    } catch (err) {
        console.error('Erreur upload modèle :', err);
        if (err && /max_allowed_packet|packet/i.test(err.message || '')) {
            return res.status(413).json({ error: 'Fichier trop volumineux pour la base', message: 'Augmentez max_allowed_packet côté MySQL.' });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/templates/:slug/file — télécharge le modèle courant (organisme ou défaut). */
const downloadTemplate = async (req, res) => {
    const { slug } = req.params;
    try {
        const buf = await getTemplateBuffer(req.user.organization_id, slug);
        if (!buf) return res.status(404).json({ message: 'Aucun modèle pour cette étape.' });
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.set('Content-Disposition', `attachment; filename="${slug}.docx"`);
        res.send(buf);
    } catch (err) {
        console.error('Erreur téléchargement modèle :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/templates/:slug — supprime la personnalisation (revient au défaut).
 * Avec ?permanent=1 : suppression DÉFINITIVE. Pour une étape ajoutée, la ligne est
 * effacée ; pour une étape du socle (définie en code), on pose un « tombstone »
 * (deleted=1) qui la masque définitivement pour cet organisme.
 */
const resetTemplate = async (req, res) => {
    const orgId = req.user.organization_id;
    const slug = req.params.slug;
    const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
    try {
        if (permanent && DEFAULT_SLUGS.has(slug)) {
            // Étape du socle : tombstone (reste masquée même après réinitialisation).
            await upsertTemplate(db.promise(), orgId, slug, { deleted: 1, active: 0 });
            logAudit(req, 'template.delete', 'DocumentTemplate', slug);
            return res.json({ success: true, message: 'Modèle supprimé définitivement.' });
        }
        // Étape ajoutée (ou réinitialisation d'une personnalisation) : on efface la ligne.
        await db.promise().query('DELETE FROM document_template WHERE organization_id = ? AND slug = ?', [orgId, slug]);
        logAudit(req, permanent ? 'template.delete' : 'template.reset', 'DocumentTemplate', slug);
        res.json({ success: true, message: permanent ? 'Modèle supprimé définitivement.' : 'Réinitialisé' });
    } catch (err) {
        console.error('Erreur suppression modèle :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/templates/:slug/duplicate — crée une copie d'un modèle (nouveau slug). */
const duplicateTemplate = async (req, res) => {
    const orgId = req.user.organization_id;
    const srcSlug = req.params.slug;
    try {
        const conn = db.promise();
        // Métadonnées fusionnées (socle + personnalisation) + ligne perso éventuelle.
        const meta = mergeSteps(await loadRows(orgId)).find((s) => s.slug === srcSlug);
        if (!meta) return res.status(404).json({ message: 'Modèle introuvable.' });
        const [[src]] = await conn.query('SELECT * FROM document_template WHERE organization_id = ? AND slug = ? LIMIT 1', [orgId, srcSlug]);
        const content = await getTemplateContent(orgId, srcSlug); // { kind, html/header/footer/layout } | { kind:'docx', buffer } | null

        // Slug unique (base-copie, base-copie-2, …), jamais un slug du socle.
        const base = String(srcSlug).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+$/,'');
        const taken = async (sl) => {
            if (DEFAULT_SLUGS.has(sl)) return true;
            const [[r]] = await conn.query('SELECT 1 AS ok FROM document_template WHERE organization_id = ? AND slug = ?', [orgId, sl]);
            return !!r;
        };
        let slug = `${base}-copie`; let i = 2;
        while (await taken(slug)) slug = `${base}-copie-${i++}`;

        const fields = {
            label: `${(meta.label || srcSlug)} (copie)`,
            doc_type: meta.doc_type || null,
            signable: meta.signable ? 1 : 0,
            stagiaire_sign: meta.stagiaire_sign ? 1 : 0,
            company_level: meta.company_level ? 1 : 0,
            company_sign: meta.company_sign ? 1 : 0,
            signers: JSON.stringify(stepSigners(meta)),
            applies_when: meta.applies_when && Object.keys(meta.applies_when).length ? JSON.stringify(meta.applies_when) : null,
            active: 1,
            sort_order: Number(meta.sort_order || 100) + 1,
        };
        if (content && content.kind === 'docx' && content.buffer) {
            fields.kind = 'docx';
            fields.file = content.buffer;
            fields.name = (src && src.name) || `${slug}.docx`;
        } else if (content) {
            fields.kind = 'builder';
            fields.body_html = content.html || null;
            fields.header_html = content.header || null;
            fields.footer_html = content.footer || null;
            if (content.layout) fields.layout = typeof content.layout === 'string' ? content.layout : JSON.stringify(content.layout);
        }
        await upsertTemplate(conn, orgId, slug, fields);
        logAudit(req, 'template.duplicate', 'DocumentTemplate', slug);
        res.status(201).json({ success: true, data: { slug }, message: 'Modèle dupliqué.' });
    } catch (err) {
        console.error('Erreur duplication modèle :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/templates/reorder — définit l'ordre des modèles (slugs ordonnés). */
const reorderTemplates = async (req, res) => {
    // `orders` = [{slug, sort_order}] (position globale explicite) ou `slugs` (position simple, legacy).
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : null;
    const slugs = Array.isArray(req.body?.slugs) ? req.body.slugs : null;
    if (!orders && !slugs) return res.status(422).json({ error: 'Liste ordonnée requise.' });
    const list = orders
        ? orders.map((o) => ({ slug: o.slug, sort_order: Number(o.sort_order) }))
        : slugs.map((s, i) => ({ slug: s, sort_order: (i + 1) * 10 }));
    try {
        const conn = db.promise();
        for (const it of list) {
            const slug = String(it.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
            if (slug && Number.isFinite(it.sort_order)) await upsertTemplate(conn, req.user.organization_id, slug, { sort_order: it.sort_order });
        }
        logAudit(req, 'template.reorder', 'DocumentTemplate', null);
        res.json({ success: true, message: 'Ordre enregistré.' });
    } catch (err) {
        console.error('Erreur réordonnancement modèles :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getTemplateBuffer, getTemplateContent, loadOrgSteps, documentSetForOrg,
    listTemplates, saveTemplate, uploadTemplate, downloadTemplate, resetTemplate, duplicateTemplate,
    getTokens, getTemplateBody, reorderTemplates, previewPdf, pageMetrics,
    loadCustomTokens, getCustomTokens, saveCustomTokens,
};
