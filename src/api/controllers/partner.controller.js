const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

const PARTNER_FIELDS = [
    'name', 'category', 'contact_name', 'contact_email', 'contact_phone',
    'website', 'town', 'discount_pct', 'offer', 'notes',
];

/**
 * GET /api/partenaires — annuaire + suivi (contacts, offre, commissions cumulées).
 * Filtre ?category=
 */
const getPartners = async (req, res) => {
    try {
        const conn = db.promise();
        const params = [req.user.organization_id];
        let sql = `
            SELECT p.id, p.name, p.category, p.contact_name, p.contact_email, p.contact_phone,
                   p.website, p.town, p.discount_pct, p.offer, p.notes, p.created_at,
                   COALESCE(SUM(re.amount), 0) AS commissions_total,
                   COUNT(re.id) AS commissions_count,
                   DATE_FORMAT(MAX(re.date), '%Y-%m-%d') AS last_commission
              FROM partner p
              LEFT JOIN revenue_extra re ON re.partner_id = p.id
             WHERE p.organization_id = ?`;
        if (req.query.category) { sql += ' AND p.category = ?'; params.push(req.query.category); }
        sql += ' GROUP BY p.id ORDER BY p.name';
        const [results] = await conn.query(sql, params);

        // Détail des commissions par partenaire (libellé, date, montant).
        const [lines] = await conn.query(
            `SELECT re.id, re.partner_id, re.label, re.amount, DATE_FORMAT(re.date, '%Y-%m-%d') AS date
             FROM revenue_extra re JOIN partner p ON p.id = re.partner_id
             WHERE p.organization_id = ? ORDER BY re.date DESC, re.created_at DESC`,
            [req.user.organization_id]
        );
        const byPartner = {};
        for (const l of lines) (byPartner[l.partner_id] = byPartner[l.partner_id] || []).push(l);
        for (const p of results) p.commissions = byPartner[p.id] || [];

        // Contributions en nature (matériel/équipement) — table optionnelle (migration 065).
        // Si la table n'existe pas encore, on renvoie des contributions vides (pas d'erreur).
        try {
            const [contribs] = await conn.query(
                `SELECT c.id, c.partner_id, c.type, c.label, c.value, DATE_FORMAT(c.date, '%Y-%m-%d') AS date
                 FROM partner_contribution c JOIN partner p ON p.id = c.partner_id
                 WHERE p.organization_id = ? ORDER BY c.date DESC, c.created_at DESC`,
                [req.user.organization_id]
            );
            const cByPartner = {};
            for (const c of contribs) (cByPartner[c.partner_id] = cByPartner[c.partner_id] || []).push(c);
            for (const p of results) p.contributions = cByPartner[p.id] || [];
        } catch {
            for (const p of results) p.contributions = [];
        }

        res.json({ data: results });
    } catch (err) {
        console.error('Erreur récupération partenaires :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/partenaires */
const createPartner = (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(422).json({ error: 'Nom du partenaire requis' });
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO partner (id, organization_id, name, category, contact_name, contact_email,
                              contact_phone, website, town, discount_pct, offer, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.organization_id, b.name, b.category || 'AUTRE', b.contact_name || null,
         b.contact_email || null, b.contact_phone || null, b.website || null, b.town || null,
         b.discount_pct === '' || b.discount_pct == null ? null : Number(b.discount_pct),
         b.offer || null, b.notes || null],
        (err) => {
            if (err) {
                console.error('Erreur création partenaire :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logAudit(req, 'partner.create', 'Partner', id);
            res.status(201).json({ message: 'Partenaire créé', id });
        }
    );
};

/** PATCH /api/partenaires/:id */
const updatePartner = (req, res) => {
    const sets = [];
    const values = [];
    for (const f of PARTNER_FIELDS) {
        if (req.body[f] === undefined) continue;
        let v = req.body[f];
        if (f === 'discount_pct') v = v === '' || v == null ? null : Number(v);
        else if (v === '') v = null;
        sets.push(`${f} = ?`);
        values.push(v);
    }
    if (sets.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    values.push(req.params.id, req.user.organization_id);
    db.query(
        `UPDATE partner SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
        values,
        (err, result) => {
            if (err) {
                console.error('Erreur mise à jour partenaire :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Partenaire introuvable' });
            logAudit(req, 'partner.update', 'Partner', req.params.id);
            res.json({ success: true, message: 'Partenaire mis à jour' });
        }
    );
};

/** DELETE /api/partenaires/:id */
const deletePartner = (req, res) => {
    db.query(
        'DELETE FROM partner WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression partenaire :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            logAudit(req, 'partner.delete', 'Partner', req.params.id);
            res.json({ success: true, message: 'Partenaire supprimé' });
        }
    );
};

/** POST /api/partenaires/contributions — apport EN NATURE (matériel/équipement). */
const createContribution = (req, res) => {
    const b = req.body || {};
    if (!b.partner_id) return res.status(422).json({ error: 'Partenaire requis' });
    if (!b.label) return res.status(422).json({ error: 'Libellé requis' });
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO partner_contribution (id, organization_id, partner_id, date, type, label, value, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.organization_id, b.partner_id, b.date || new Date().toISOString().slice(0, 10),
         b.type || 'MATERIEL', b.label, b.value === '' || b.value == null ? 0 : Number(b.value), b.note || null],
        (err) => {
            if (err) {
                console.error('Erreur création contribution :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logAudit(req, 'partner.contribution.create', 'PartnerContribution', id);
            res.status(201).json({ message: 'Contribution enregistrée', id });
        }
    );
};

/** DELETE /api/partenaires/contributions/:id */
const deleteContribution = (req, res) => {
    db.query(
        'DELETE FROM partner_contribution WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression contribution :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logAudit(req, 'partner.contribution.delete', 'PartnerContribution', req.params.id);
            res.json({ success: true, message: 'Contribution supprimée' });
        }
    );
};

module.exports = { getPartners, createPartner, updatePartner, deletePartner, createContribution, deleteContribution };
