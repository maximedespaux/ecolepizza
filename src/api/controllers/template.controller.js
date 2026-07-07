const crypto = require('crypto');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { defaultTemplateBuffer, defaultTemplateHtml } = require('../lib/docxfill.js');
const { mergeSteps, stepsToDocSet } = require('../lib/documents.js');
const { TOKEN_CATALOG } = require('../lib/tokens.js');

// Colonnes de métadonnées d'étape lues depuis document_template.
const META_COLS = 'slug, label, doc_type, kind, sort_order, signable, stagiaire_sign, applies_when, active';

// Lit les lignes document_template d'un organisme (métadonnées + présence de contenu).
async function loadRows(organizationId) {
    const [rows] = await db.promise().query(
        `SELECT ${META_COLS}, name, (file IS NOT NULL) AS has_file, (body_html IS NOT NULL) AS has_body,
                DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
         FROM document_template WHERE organization_id = ?`,
        [organizationId]
    );
    return rows;
}

/**
 * Contenu de rendu pour un organisme + slug.
 * Renvoie { kind:'builder', html } (corps propre ou défaut) ou
 * { kind:'docx', buffer } (ancien mode fichier), ou null si aucune source.
 */
async function getTemplateContent(organizationId, slug) {
    const [rows] = await db.promise().query(
        'SELECT kind, body_html, file FROM document_template WHERE organization_id = ? AND slug = ? LIMIT 1',
        [organizationId, slug]
    );
    const row = rows[0];
    if (row) {
        if (row.kind === 'docx') {
            if (row.file) return { kind: 'docx', buffer: row.file };
        } else if (row.body_html) {
            return { kind: 'builder', html: row.body_html };
        }
    }
    // Défauts fournis : d'abord le corps « builder », sinon l'ancien .docx.
    const html = defaultTemplateHtml(slug);
    if (html) return { kind: 'builder', html };
    const buf = defaultTemplateBuffer(slug);
    return buf ? { kind: 'docx', buffer: buf } : null;
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
            has_default_body: !!defaultTemplateHtml(s.slug),
            has_default_file: !!defaultTemplateBuffer(s.slug),
            file_name: raw[s.slug]?.name || null,
            updated_at: raw[s.slug]?.updated_at || null,
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
    const keys = Object.keys(fields);
    if (ex.length) {
        if (keys.length) {
            await conn.query(`UPDATE document_template SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
                [...keys.map((k) => fields[k]), ex[0].id]);
        }
        return ex[0].id;
    }
    const id = crypto.randomUUID();
    await conn.query(
        `INSERT INTO document_template (id, organization_id, slug, ${keys.join(', ')}) VALUES (?, ?, ?, ${keys.map(() => '?').join(', ')})`,
        [id, orgId, slug, ...keys.map((k) => fields[k])]
    );
    return id;
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
    if (b.signable !== undefined) fields.signable = b.signable ? 1 : 0;
    if (b.stagiaire_sign !== undefined) fields.stagiaire_sign = b.stagiaire_sign ? 1 : 0;
    if (b.applies_when !== undefined) fields.applies_when = b.applies_when ? JSON.stringify(b.applies_when) : null;
    if (b.active !== undefined) fields.active = b.active ? 1 : 0;
    // Corps construit dans l'éditeur : passe l'étape en mode « builder ».
    if (b.body_html !== undefined) { fields.body_html = b.body_html || null; fields.kind = 'builder'; }
    if (b.kind !== undefined && (b.kind === 'builder' || b.kind === 'docx')) fields.kind = b.kind;
    try {
        await upsertTemplate(db.promise(), req.user.organization_id, slug, fields);
        logAudit(req, 'template.save', 'DocumentTemplate', slug);
        res.status(200).json({ success: true, message: 'Étape enregistrée' });
    } catch (err) {
        console.error('Erreur enregistrement étape :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/templates/tokens — catalogue des jetons (regroupé par table) pour la palette. */
const getTokens = (req, res) => {
    res.json({ data: TOKEN_CATALOG });
};

/** GET /api/templates/:slug/body — corps HTML du modèle (propre à l'organisme ou défaut). */
const getTemplateBody = async (req, res) => {
    try {
        const content = await getTemplateContent(req.user.organization_id, req.params.slug);
        if (!content) return res.json({ data: { slug: req.params.slug, kind: 'builder', body_html: '' } });
        if (content.kind === 'docx') {
            // Ancien modèle .docx sans corps éditable : on renvoie un corps vide à composer.
            return res.json({ data: { slug: req.params.slug, kind: 'docx', body_html: '' } });
        }
        res.json({ data: { slug: req.params.slug, kind: 'builder', body_html: content.html } });
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

    try {
        const zip = new PizZip(req.file.buffer);
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

/** DELETE /api/templates/:slug — supprime la personnalisation (revient au défaut / retire l'étape). */
const resetTemplate = async (req, res) => {
    try {
        await db.promise().query('DELETE FROM document_template WHERE organization_id = ? AND slug = ?', [req.user.organization_id, req.params.slug]);
        logAudit(req, 'template.reset', 'DocumentTemplate', req.params.slug);
        res.json({ success: true, message: 'Réinitialisé' });
    } catch (err) {
        console.error('Erreur réinitialisation modèle :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getTemplateBuffer, getTemplateContent, loadOrgSteps, documentSetForOrg,
    listTemplates, saveTemplate, uploadTemplate, downloadTemplate, resetTemplate,
    getTokens, getTemplateBody,
};
