const db = require('../config/database.js');

/**
 * GET /api/formations — catalogue des formations de l'organisme.
 */
const getPrograms = (req, res) => {
    db.query(
        `SELECT id, organization_id, code, title, days, hours, price, rs_code,
                hygiene, objectives, created_at
         FROM training_program
         WHERE organization_id = ?
         ORDER BY code`,
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération formations :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.json({ data: results });
        }
    );
};

/**
 * GET /api/formations/:id
 */
const getProgram = (req, res) => {
    db.query(
        'SELECT * FROM training_program WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération formation :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (results.length === 0) {
                return res.status(404).json({ message: 'Formation introuvable' });
            }
            res.json({ data: results[0] });
        }
    );
};

/**
 * POST /api/formations
 */
const createProgram = (req, res) => {
    const { code, title, days, hours, price, rs_code, hygiene, objectives } = req.body;
    if (!code || !title) {
        return res.status(422).json({ error: 'Code et intitulé requis' });
    }
    db.query(
        `INSERT INTO training_program
            (id, organization_id, code, title, days, hours, price, rs_code, hygiene, objectives)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.organization_id, code, title, days, hours, price, rs_code || null,
         hygiene ? 1 : 0, objectives || null],
        (err) => {
            if (err) {
                console.error('Erreur création formation :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.status(201).json({ message: 'Formation créée' });
        }
    );
};

module.exports = { getPrograms, getProgram, createProgram };
