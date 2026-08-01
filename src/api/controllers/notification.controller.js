const crypto = require('crypto');
const db = require('../config/database.js');

/**
 * Crée une notification (best-effort). user_id null = visible par tout l'organisme.
 */
function notify(orgId, { userId = null, type = 'INFO', title, body = null, link = null }) {
    /* Renvoie une PROMESSE, pour que l'appelant puisse attendre l'insertion avant de répondre.
     *
     * Pourquoi ça compte : toute réponse réussie déclenche une diffusion SSE `refresh` à
     * l'organisme (broadcastMutations), et chaque poste recharge alors ses notifications dans la
     * seconde. Si l'insertion n'est pas encore validée sur la base DISTANTE à ce moment-là, le
     * compteur n'a pas bougé — donc pas de son, pas de cloche : il faut attendre le sondage de
     * secours, jusqu'à vingt-cinq secondes plus tard. Une course qu'on gagne le plus souvent,
     * mais pas toujours, ce qui donne une alerte tantôt immédiate tantôt tardive.
     *
     * Reste au mieux : l'erreur est journalisée et avalée. Une notification manquée ne doit
     * jamais faire échouer l'action qu'elle accompagne. */
    return db.promise()
        .query(
            `INSERT INTO notification (id, organization_id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), orgId, userId, type, title, body, link])
        .catch((err) => { console.error('notification:', err.message); });
}

/**
 * GET /api/notifications — notifications de l'utilisateur (perso + organisme).
 */
const getNotifications = (req, res) => {
    db.query(
        `SELECT id, type, title, body, link, is_read,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
         FROM notification
         WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL)
         ORDER BY created_at DESC
         LIMIT 40`,
        [req.user.organization_id, req.user.id],
        (err, rows) => {
            if (err) {
                console.error('Erreur notifications :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            const unread = rows.filter((r) => !r.is_read).length;
            res.json({ data: rows, unread });
        }
    );
};

/**
 * PATCH /api/notifications/:id/read — marque comme lue.
 */
const markRead = (req, res) => {
    db.query(
        `UPDATE notification SET is_read = 1
         WHERE id = ? AND organization_id = ? AND (user_id = ? OR user_id IS NULL)`,
        [req.params.id, req.user.organization_id, req.user.id],
        (err) => {
            if (err) return res.status(400).json({ message: 'Erreur' });
            res.json({ success: true });
        }
    );
};

/**
 * POST /api/notifications/read-all — marque tout comme lu.
 */
const markAllRead = (req, res) => {
    db.query(
        `UPDATE notification SET is_read = 1
         WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL) AND is_read = 0`,
        [req.user.organization_id, req.user.id],
        (err) => {
            if (err) return res.status(400).json({ message: 'Erreur' });
            res.json({ success: true });
        }
    );
};

module.exports = { getNotifications, markRead, markAllRead, notify };
