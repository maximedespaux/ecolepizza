const db = require('../config/database.js');
const { preciser } = require('../lib/precisionsActivite.js');
const { colonneExiste } = require('../lib/colonnes.js');

/**
 * GET /api/audit — journal des actions sensibles (100 dernières), filtre ?q=.
 *
 * CHAQUE LIGNE DIT CE QU'ELLE DÉSIGNE (2026-09-28) : `objet` — « Devis particulier », « RS7404 ·
 * S38 2026 » — et `stagiaire` ({ id, nom, soi }), relus par lib/precisionsActivite.js, comme dans la
 * cloche. Le journal affichait « Document » à côté de « Document supprimé » : l'entité redisait
 * l'action, et rien ne disait lequel. Les colonnes figées de la migration 186 (`libelle`,
 * `learner_id`) ne sortent pas telles quelles : elles servent à nommer, pas à être lues.
 */
const getAudit = async (req, res) => {
    // Échappe les métacaractères LIKE (\ % _) pour éviter l'abus de jokers.
    const escapeLike = (s) => String(s).replace(/[\\%_]/g, (c) => '\\' + c);
    const q = req.query.q ? `%${escapeLike(req.query.q)}%` : '%';
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        // Une seule colonne sondée : les deux de la 186 arrivent par le même ALTER.
        const figes = await colonneExiste(conn, 'audit_log', 'libelle')
            ? 'a.libelle, a.learner_id' : 'NULL AS libelle, NULL AS learner_id';
        const [rows] = await conn.query(
            `SELECT a.id, a.action, a.entity, a.entity_id, a.user_id, ${figes},
                    DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS created_at,
                    u.first_name, u.last_name, u.email
             FROM audit_log a
             LEFT JOIN user u ON u.id = a.user_id
             WHERE a.organization_id = ?
               AND (a.action LIKE ? OR a.entity LIKE ?)
             ORDER BY a.created_at DESC
             LIMIT 100`,
            [orgId, q, q]);
        const precisions = await preciser(conn, orgId, rows);
        res.json({
            data: rows.map((r, i) => ({
                id: r.id, action: r.action, entity: r.entity, entity_id: r.entity_id,
                created_at: r.created_at, first_name: r.first_name, last_name: r.last_name, email: r.email,
                objet: precisions[i].objet, stagiaire: precisions[i].stagiaire,
            })),
        });
    } catch (err) {
        console.error('Erreur journal audit :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getAudit };
