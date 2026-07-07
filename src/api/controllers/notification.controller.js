const crypto = require('crypto');
const db = require('../config/database.js');

/**
 * Crée une notification (best-effort). user_id null = visible par tout l'organisme.
 */
function notify(orgId, { userId = null, type = 'INFO', title, body = null }) {
    db.query(
        `INSERT INTO notification (id, organization_id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), orgId, userId, type, title, body],
        (err) => { if (err) console.error('notification:', err.message); }
    );
}

/**
 * GET /api/notifications — notifications de l'utilisateur (perso + organisme).
 */
const getNotifications = (req, res) => {
    db.query(
        `SELECT id, type, title, body, is_read,
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
