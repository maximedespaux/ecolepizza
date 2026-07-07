const db = require('../config/database.js');

/**
 * GET /api/audit — journal des actions sensibles (100 dernières), filtre ?q=.
 */
const getAudit = (req, res) => {
    const q = req.query.q ? `%${req.query.q}%` : '%';
    db.query(
        `SELECT a.id, a.action, a.entity, a.entity_id,
                DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS created_at,
                u.first_name, u.last_name, u.email
         FROM audit_log a
         LEFT JOIN user u ON u.id = a.user_id
         WHERE a.organization_id = ?
           AND (a.action LIKE ? OR a.entity LIKE ?)
         ORDER BY a.created_at DESC
         LIMIT 100`,
        [req.user.organization_id, q, q],
        (err, results) => {
            if (err) {
                console.error('Erreur journal audit :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.json({ data: results });
        }
    );
};

module.exports = { getAudit };
