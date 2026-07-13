// Endpoints PUBLICS (sans authentification) : signature d'un document via un lien
// partageable (le représentant d'une entreprise signe sans compte).
const db = require('../config/database.js');
const { renderDocumentHtml, applySlotSignature, clientIp } = require('./document.controller.js');

async function loadLink(conn, token) {
    const [[link]] = await conn.query('SELECT * FROM document_sign_link WHERE token = ?', [token]);
    return link || null;
}

/** GET /api/public/sign/:token — infos + aperçu du document à signer. */
const getSignPage = async (req, res) => {
    try {
        const conn = db.promise();
        const link = await loadLink(conn, req.params.token);
        if (!link) return res.status(404).json({ message: 'Lien invalide.' });
        if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).json({ message: 'Ce lien a expiré.' });
        const [[doc]] = await conn.query('SELECT * FROM generated_document WHERE id = ?', [link.document_id]);
        if (!doc) return res.status(404).json({ message: 'Document introuvable.' });
        let company = null;
        if (doc.company_id) { const [[c]] = await conn.query('SELECT name FROM company WHERE id = ?', [doc.company_id]); company = c ? c.name : null; }
        let html = null;
        try { html = await renderDocumentHtml(conn, doc.organization_id, doc); } catch (e) { console.error('Aperçu lien signature :', e.message); }
        const already = doc.status === 'SIGNE' || !!link.used_at;
        res.json({ data: { title: doc.title, company, label: link.label || 'Signature', signed: already, signer_name: doc.signer_name || null, html: html || '<p>Aperçu indisponible.</p>' } });
    } catch (err) {
        console.error('Erreur lien de signature :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/public/sign/:token — enregistre la signature du signataire externe. */
const submitSign = async (req, res) => {
    try {
        const conn = db.promise();
        const link = await loadLink(conn, req.params.token);
        if (!link) return res.status(404).json({ message: 'Lien invalide.' });
        if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).json({ message: 'Ce lien a expiré.' });
        if (link.used_at) return res.status(409).json({ message: 'Ce document a déjà été signé.' });
        const signer_name = String((req.body || {}).signer_name || '').trim();
        const signature_data = (req.body || {}).signature_data;
        if (!signer_name || !signature_data) return res.status(422).json({ message: 'Nom et signature requis.' });
        const [[doc]] = await conn.query('SELECT * FROM generated_document WHERE id = ?', [link.document_id]);
        if (!doc) return res.status(404).json({ message: 'Document introuvable.' });
        if (doc.status === 'SIGNE') return res.status(409).json({ message: 'Ce document a déjà été signé.' });
        await applySlotSignature(conn, doc.organization_id, doc, {
            slot: link.slot, label: link.label, signerName: signer_name, signatureData: signature_data,
            ip: clientIp(req), userAgent: req.headers['user-agent'] || '',
        });
        await conn.query('UPDATE document_sign_link SET used_at = NOW() WHERE token = ?', [req.params.token]);
        res.json({ success: true, message: 'Document signé. Merci !' });
    } catch (err) {
        console.error('Erreur signature publique :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSignPage, submitSign };
