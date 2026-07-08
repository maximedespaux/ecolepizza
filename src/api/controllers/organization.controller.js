const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

/**
 * GET /api/organisation — l'organisme de l'utilisateur connecté.
 */
const getOrganization = (req, res) => {
    db.query(
        'SELECT * FROM organization WHERE id = ?',
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération organisme :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (results.length === 0) return res.status(404).json({ message: 'Organisme introuvable' });
            res.json({ data: results[0] });
        }
    );
};

/**
 * PATCH /api/organisation — met à jour l'organisme (admin / secrétariat).
 */
const updateOrganization = (req, res) => {
    const allowed = ['legal_name', 'short_name', 'code', 'manager', 'siret', 'vat_number', 'nda', 'naf_ape',
        'address', 'zip_code', 'town', 'phone', 'email', 'qualiopi'];

    const updates = [];
    const values = [];
    for (const f of allowed) {
        if (req.body[f] === undefined) continue;
        let v = req.body[f];
        if (f === 'qualiopi') v = v ? 1 : 0;
        else if (f === 'code') {
            // Code court unique : majuscules, alphanumérique + tiret, ou NULL si vidé.
            v = String(v).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || null;
        }
        updates.push(`${f} = ?`);
        values.push(v);
    }
    if (updates.length === 0) {
        return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    }
    values.push(req.user.organization_id);

    db.query(
        `UPDATE organization SET ${updates.join(', ')} WHERE id = ?`,
        values,
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ error: 'Ce code organisme est déjà utilisé.' });
                }
                console.error('Erreur mise à jour organisme :', err);
                return res.status(400).json({ message: 'Erreur mise à jour' });
            }
            logAudit(req, 'organization.update', 'Organization', req.user.organization_id);
            res.status(200).json({ success: true, message: 'Organisme mis à jour' });
        }
    );
};

module.exports = { getOrganization, updateOrganization };
