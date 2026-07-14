// Espace REPRÉSENTANT d'entreprise : le référent d'une entreprise se connecte et
// signe lui-même les documents de NIVEAU ENTREPRISE de son entreprise.
const db = require('../config/database.js');
const { renderDocumentHtml, applySlotSignature, clientIp } = require('./document.controller.js');

const isMissingSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');

// Entreprise(s) rattachée(s) au compte du représentant connecté.
async function repCompanies(conn, req) {
    try {
        const [rows] = await conn.query('SELECT id, name FROM company WHERE user_id = ? AND organization_id = ?', [req.user.id, req.user.organization_id]);
        return rows;
    } catch (e) { if (isMissingSchema(e)) return []; throw e; }
}

/** GET /api/rep/documents — documents « entreprise » de l'entreprise du représentant. */
const getRepDocuments = async (req, res) => {
    try {
        const conn = db.promise();
        const companies = await repCompanies(conn, req);
        if (!companies.length) return res.json({ data: { company: null, documents: [] } });
        const ids = companies.map((c) => c.id);
        let rows = [];
        try {
            [rows] = await conn.query(
                `SELECT id, title, type, status, template_slug, session_id,
                        DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i') AS sent_at
                 FROM generated_document
                 WHERE organization_id = ? AND scope = 'COMPANY' AND company_id IN (?)
                 ORDER BY created_at DESC`,
                [req.user.organization_id, ids]);
        } catch (e) { if (!isMissingSchema(e)) throw e; }
        res.json({ data: { company: companies[0].name, documents: rows } });
    } catch (err) {
        console.error('Erreur documents représentant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/rep/documents/:id/preview — aperçu HTML d'un document entreprise du représentant. */
const previewRepDocument = async (req, res) => {
    try {
        const conn = db.promise();
        const companies = await repCompanies(conn, req);
        const ids = companies.map((c) => c.id);
        if (!ids.length) return res.status(403).json({ message: 'Accès refusé.' });
        const [[doc]] = await conn.query(
            "SELECT * FROM generated_document WHERE id = ? AND organization_id = ? AND scope = 'COMPANY' AND company_id IN (?)",
            [req.params.id, req.user.organization_id, ids]);
        if (!doc) return res.status(404).json({ message: 'Document introuvable.' });
        let html = null;
        try { html = await renderDocumentHtml(conn, doc.organization_id, doc); } catch (e) { console.error('Aperçu document représentant :', e.message); }
        res.json({ data: { title: doc.title, status: doc.status, html: html || '<p>Aperçu indisponible.</p>' } });
    } catch (err) {
        console.error('Erreur aperçu document représentant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/rep/documents/:id/sign — le représentant signe un document entreprise. */
const signRepDocument = async (req, res) => {
    try {
        const conn = db.promise();
        const signerName = String((req.body || {}).signer_name || '').trim();
        const signatureData = (req.body || {}).signature_data;
        if (!signerName || !signatureData) return res.status(422).json({ message: 'Nom et signature requis.' });
        const companies = await repCompanies(conn, req);
        const ids = companies.map((c) => c.id);
        if (!ids.length) return res.status(403).json({ message: 'Accès refusé.' });
        const [[doc]] = await conn.query(
            "SELECT * FROM generated_document WHERE id = ? AND organization_id = ? AND scope = 'COMPANY' AND company_id IN (?)",
            [req.params.id, req.user.organization_id, ids]);
        if (!doc) return res.status(404).json({ message: 'Document introuvable.' });
        if (doc.status === 'SIGNE') return res.status(409).json({ message: 'Document déjà signé.' });
        await applySlotSignature(conn, doc.organization_id, doc, {
            slot: 'representant', label: 'Signature du représentant',
            signerName, signatureData, ip: clientIp(req), userAgent: req.headers['user-agent'] || '',
        });
        res.json({ success: true, message: 'Document signé.' });
    } catch (err) {
        console.error('Erreur signature représentant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getRepDocuments, previewRepDocument, signRepDocument };
