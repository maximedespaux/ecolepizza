const db = require('../config/database.js');

/**
 * GET /api/companies — entreprises / financeurs de l'organisme.
 */
const getCompanies = (req, res) => {
    db.query(
        `SELECT id, organization_id, name, siret, town, email, phone,
                representative_civ, representative_name, created_at
         FROM company
         WHERE organization_id = ?
         ORDER BY name`,
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération entreprises :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.json({ data: results });
        }
    );
};

/**
 * POST /api/companies
 */
const createCompany = (req, res) => {
    const {
        name, siret, address, zip_code, town, email, phone, opco,
        representative_civ, representative_name,
    } = req.body;

    if (!name) {
        return res.status(422).json({ error: "Nom de l'entreprise requis" });
    }

    db.query(
        `INSERT INTO company
            (id, organization_id, name, siret, address, zip_code, town, email, phone, opco,
             representative_civ, representative_name)
         VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.organization_id, name, siret, address, zip_code, town, email, phone, opco,
         representative_civ, representative_name],
        (err) => {
            if (err) {
                console.error('Erreur création entreprise :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.status(201).json({ message: 'Entreprise créée' });
        }
    );
};

module.exports = { getCompanies, createCompany };
