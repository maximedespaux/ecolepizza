const db = require('../config/database.js');

/**
 * GET /api/enrollments — dossiers (inscription stagiaire ↔ session).
 * Renvoie le stagiaire, la session et le programme associés.
 */
const getEnrollments = (req, res) => {
    db.query(
        `SELECT e.id, e.organization_id, e.learner_id, e.session_id, e.company_id,
                e.financing, e.crm_stage, e.conformite_score, e.created_at,
                l.first_name, l.last_name,
                p.code AS program_code, p.title AS program_title,
                s.year, s.week
         FROM enrollment e
         LEFT JOIN learner l ON l.id = e.learner_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         WHERE e.organization_id = ?
         ORDER BY e.created_at DESC`,
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération dossiers :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.json({ data: results });
        }
    );
};

/**
 * POST /api/enrollments — crée un dossier.
 */
const createEnrollment = (req, res) => {
    const {
        learner_id,
        session_id,
        company_id,
        financing = 'PARTICULIER',
        crm_stage = 'PROSPECT',
    } = req.body;

    if (!learner_id || !session_id) {
        return res.status(422).json({ error: 'Stagiaire et session requis' });
    }

    db.query(
        `INSERT INTO enrollment
            (id, organization_id, learner_id, session_id, company_id, financing, crm_stage, conformite_score)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'ROUGE')`,
        [req.user.organization_id, learner_id, session_id, company_id || null, financing, crm_stage],
        (err) => {
            if (err) {
                console.error('Erreur création dossier :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.status(201).json({ message: 'Dossier créé' });
        }
    );
};

/**
 * DELETE /api/enrollments/:id — retire un stagiaire d'une session.
 */
const deleteEnrollment = (req, res) => {
    db.query(
        'DELETE FROM enrollment WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression dossier :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            res.status(200).json({ success: true, message: 'Stagiaire retiré' });
        }
    );
};

/**
 * PATCH /api/enrollments/:id — met à jour l'étape CRM ou le score de conformité.
 */
const updateEnrollment = (req, res) => {
    const allowedFields = ['financing', 'crm_stage', 'conformite_score', 'company_id'];
    const updates = [];
    const values = [];
    for (const field of allowedFields) {
        if (req.body[field] !== undefined && req.body[field] !== '') {
            updates.push(`${field} = ?`);
            values.push(req.body[field]);
        }
    }
    if (updates.length === 0) {
        return res.status(400).json({ message: 'Aucun champ valide à mettre à jour' });
    }
    values.push(req.params.id, req.user.organization_id);

    db.query(
        `UPDATE enrollment SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
        values,
        (err) => {
            if (err) {
                console.error('Erreur mise à jour dossier :', err);
                return res.status(400).json({ message: 'Erreur mise à jour' });
            }
            res.status(200).json({ success: true, message: 'Dossier mis à jour' });
        }
    );
};

module.exports = { getEnrollments, createEnrollment, updateEnrollment, deleteEnrollment };
