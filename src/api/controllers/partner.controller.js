const db = require('../config/database.js');

/**
 * GET /api/partenaires — annuaire des partenaires, filtre ?category=
 */
const getPartners = (req, res) => {
    const params = [req.user.organization_id];
    let sql = `SELECT id, organization_id, name, category, contact_email, contact_phone, website, created_at
               FROM partner
               WHERE organization_id = ?`;
    if (req.query.category) {
        sql += ' AND category = ?';
        params.push(req.query.category);
    }
    sql += ' ORDER BY name';

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Erreur récupération partenaires :', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        res.json({ data: results });
    });
};

/**
 * POST /api/partenaires
 */
const createPartner = (req, res) => {
    const { name, category, contact_email, contact_phone, website } = req.body;
    if (!name) {
        return res.status(422).json({ error: 'Nom du partenaire requis' });
    }
    db.query(
        `INSERT INTO partner
            (id, organization_id, name, category, contact_email, contact_phone, website)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
        [req.user.organization_id, name, category || 'AUTRE', contact_email, contact_phone, website],
        (err) => {
            if (err) {
                console.error('Erreur création partenaire :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.status(201).json({ message: 'Partenaire créé' });
        }
    );
};

module.exports = { getPartners, createPartner };
