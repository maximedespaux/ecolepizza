const crypto = require('crypto');
const db = require('../config/database.js');

// Vérifie que le dossier appartient bien à l'organisme du demandeur.
function assertEnrollment(conn, enrollmentId, orgId) {
    return conn.query('SELECT id FROM enrollment WHERE id = ? AND organization_id = ?', [enrollmentId, orgId]);
}

/**
 * GET /api/enrollments/:id/notes — notes de suivi CRM d'un dossier.
 */
const getNotes = async (req, res) => {
    try {
        const conn = db.promise();
        const [ok] = await assertEnrollment(conn, req.params.id, req.user.organization_id);
        if (ok.length === 0) return res.status(404).json({ message: 'Dossier introuvable' });
        const [notes] = await conn.query(
            `SELECT n.id, n.body, DATE_FORMAT(n.reminder_at, '%Y-%m-%d') AS reminder_at,
                    DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') AS created_at,
                    u.first_name, u.last_name
             FROM enrollment_note n
             LEFT JOIN user u ON u.id = n.author_id
             WHERE n.enrollment_id = ?
             ORDER BY n.created_at DESC`,
            [req.params.id]
        );
        res.json({ data: notes });
    } catch (err) {
        console.error('Erreur notes :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/enrollments/:id/notes — ajoute une note (+ rappel optionnel).
 */
const createNote = async (req, res) => {
    const { body, reminder_at } = req.body;
    if (!body || !body.trim()) return res.status(422).json({ error: 'Note vide' });
    try {
        const conn = db.promise();
        const [ok] = await assertEnrollment(conn, req.params.id, req.user.organization_id);
        if (ok.length === 0) return res.status(404).json({ message: 'Dossier introuvable' });
        await conn.query(
            `INSERT INTO enrollment_note (id, enrollment_id, author_id, body, reminder_at)
             VALUES (?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.params.id, req.user.id, body.trim(), reminder_at || null]
        );
        res.status(201).json({ message: 'Note ajoutée' });
    } catch (err) {
        console.error('Erreur création note :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/enrollments/:id/notes/:noteId
 */
const deleteNote = async (req, res) => {
    try {
        const conn = db.promise();
        const [ok] = await assertEnrollment(conn, req.params.id, req.user.organization_id);
        if (ok.length === 0) return res.status(404).json({ message: 'Dossier introuvable' });
        await conn.query('DELETE FROM enrollment_note WHERE id = ? AND enrollment_id = ?',
            [req.params.noteId, req.params.id]);
        res.status(200).json({ success: true, message: 'Note supprimée' });
    } catch (err) {
        console.error('Erreur suppression note :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getNotes, createNote, deleteNote };
