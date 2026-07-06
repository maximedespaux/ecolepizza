const db = require('../config/database.js');

// --- Utilitaires de dates (jours ouvrés + semaine ISO) ---------------------

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Date de fin = premier jour + (total-1) jours ouvrés (lun-ven).
function addBusinessDays(startStr, total) {
    const [y, m, d] = startStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    let count = 1;
    while (count < total) {
        date.setDate(date.getDate() + 1);
        const wd = date.getDay();
        if (wd !== 0 && wd !== 6) count += 1;
    }
    return fmt(date);
}

// Année + n° de semaine ISO d'une date « YYYY-MM-DD ».
function isoWeek(startStr) {
    const [y, m, d] = startStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return { year: date.getUTCFullYear(), week };
}

/**
 * GET /api/sessions — sessions + programme + nombre de stagiaires inscrits.
 */
const getSessions = (req, res) => {
    db.query(
        `SELECT s.id, s.organization_id, s.program_id, s.year, s.week,
                DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                s.trainer, s.status, s.created_at,
                p.code AS program_code, p.title AS program_title, p.days AS program_days,
                (SELECT COUNT(*) FROM enrollment e WHERE e.session_id = s.id) AS stagiaires
         FROM training_session s
         LEFT JOIN training_program p ON p.id = s.program_id
         WHERE s.organization_id = ?
         ORDER BY s.start_date DESC`,
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération sessions :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.json({ data: results });
        }
    );
};

/**
 * GET /api/sessions/:id — session + programme + stagiaires inscrits.
 */
const getSession = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT s.id, s.program_id, s.year, s.week, s.trainer, s.status,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                    p.code AS program_code, p.title AS program_title,
                    p.days AS program_days, p.hours AS program_hours
             FROM training_session s
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE s.id = ? AND s.organization_id = ?`,
            [req.params.id, req.user.organization_id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Session introuvable' });
        }
        const [enrollments] = await conn.query(
            `SELECT e.id, e.learner_id, e.crm_stage, e.conformite_score,
                    l.first_name, l.last_name, l.email, l.phone
             FROM enrollment e
             LEFT JOIN learner l ON l.id = e.learner_id
             WHERE e.session_id = ? AND e.organization_id = ?
             ORDER BY l.last_name, l.first_name`,
            [req.params.id, req.user.organization_id]
        );
        res.json({ data: { ...rows[0], enrollments } });
    } catch (err) {
        console.error('Erreur récupération session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/sessions — crée une session à partir d'une formation + son premier
 * jour. La date de fin est calculée automatiquement (jours ouvrés selon la durée).
 */
const createSession = async (req, res) => {
    const { program_id, start_date, trainer = null, status = 'PLANIFIEE' } = req.body;
    if (!program_id || !start_date) {
        return res.status(422).json({ error: 'Formation et premier jour requis' });
    }
    try {
        const conn = db.promise();
        const [progs] = await conn.query(
            'SELECT days FROM training_program WHERE id = ? AND organization_id = ?',
            [program_id, req.user.organization_id]
        );
        if (progs.length === 0) {
            return res.status(404).json({ message: 'Formation introuvable' });
        }
        const days = progs[0].days || 1;
        const end_date = addBusinessDays(start_date, days);
        const { year, week } = isoWeek(start_date);

        await conn.query(
            `INSERT INTO training_session
                (id, organization_id, program_id, year, week, start_date, end_date, trainer, status)
             VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.organization_id, program_id, year, week, start_date, end_date, trainer, status]
        );
        res.status(201).json({ message: 'Session créée' });
    } catch (err) {
        console.error('Erreur création session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/sessions/:id
 */
const deleteSession = (req, res) => {
    db.query(
        'DELETE FROM training_session WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression session :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            res.status(200).json({ success: true, message: 'Session supprimée' });
        }
    );
};

module.exports = { getSessions, getSession, createSession, deleteSession };
