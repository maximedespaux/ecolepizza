const db = require('../config/database.js');
const { computeParcours } = require('../lib/parcours.js');

const STAGE_ORDER = ['PROSPECT', 'CONTACTE', 'DEVIS_ENVOYE', 'DEVIS_SIGNE', 'ACOMPTE_PAYE', 'INSCRIT', 'EN_FORMATION', 'TERMINE', 'EVALUATION_ENVOYEE', 'ARCHIVE'];

/**
 * GET /api/enrollments — dossiers (inscription stagiaire ↔ session) pour le pipeline.
 * Fait avancer automatiquement les dossiers inscrits selon les dates de session
 * (session commencée → En formation, session finie → Terminé) et renvoie le
 * nombre de documents créés/signés par dossier.
 */
const getEnrollments = async (req, res) => {
    try {
        const conn = db.promise();
        const [results] = await conn.query(
            `SELECT e.id, e.organization_id, e.learner_id, e.session_id, e.company_id,
                    e.financing, e.crm_stage, e.conformite_score, e.created_at,
                    l.first_name, l.last_name,
                    p.code AS program_code, p.title AS program_title,
                    s.year, s.week,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                    COALESCE(dc.doc_total, 0)  AS doc_total,
                    COALESCE(dc.doc_signed, 0) AS doc_signed
             FROM enrollment e
             LEFT JOIN learner l ON l.id = e.learner_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             LEFT JOIN (
                 SELECT df.enrollment_id,
                        COUNT(*) AS doc_total,
                        SUM(gd.status = 'SIGNE') AS doc_signed
                 FROM document_formation df
                 JOIN generated_document gd ON gd.id = df.document_id
                 GROUP BY df.enrollment_id
             ) dc ON dc.enrollment_id = e.id
             WHERE e.organization_id = ?
             ORDER BY e.created_at DESC`,
            [req.user.organization_id]
        );

        // Avancement temporel (seulement pour les dossiers déjà « Inscrit »).
        const today = new Date().toISOString().slice(0, 10);
        const iInscrit = STAGE_ORDER.indexOf('INSCRIT');
        const iTermine = STAGE_ORDER.indexOf('TERMINE');
        for (const e of results) {
            const idx = STAGE_ORDER.indexOf(e.crm_stage);
            if (idx < iInscrit || idx >= iTermine) continue;
            let target = null;
            if (e.end_date && e.end_date <= today) target = 'TERMINE';
            else if (e.start_date && e.start_date <= today) target = 'EN_FORMATION';
            if (target && STAGE_ORDER.indexOf(target) > idx) {
                await conn.query('UPDATE enrollment SET crm_stage = ? WHERE id = ?', [target, e.id]);
                e.crm_stage = target;
            }
        }
        res.json({ data: results });
    } catch (err) {
        console.error('Erreur récupération dossiers :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/enrollments/:id/parcours — parcours (cycle de vie) d'un dossier :
 * étapes de l'inscription au suivi, avec l'étape en cours et l'avancement.
 */
const getParcours = async (req, res) => {
    try {
        const conn = db.promise();
        const [[e]] = await conn.query(
            `SELECT e.id, e.crm_stage, e.financing,
                    p.title AS program_title, p.code AS program_code,
                    s.year, s.week,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                    l.opco
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             LEFT JOIN learner l ON l.id = e.learner_id
             WHERE e.id = ? AND e.organization_id = ?`,
            [req.params.id, req.user.organization_id]
        );
        if (!e) return res.status(404).json({ message: 'Dossier introuvable' });

        const [docs] = await conn.query(
            `SELECT gd.id, gd.type, gd.status FROM generated_document gd
             JOIN document_formation df ON df.document_id = gd.id
             WHERE df.enrollment_id = ?`,
            [req.params.id]
        );

        const today = new Date().toISOString().slice(0, 10);
        const parc = computeParcours({ crmStage: e.crm_stage, startDate: e.start_date, endDate: e.end_date, today, docs });

        res.json({
            data: {
                header: {
                    title: e.program_title || '—',
                    code: e.program_code || '',
                    session: e.week ? `SEM ${e.week}/${e.year || ''}` : '',
                    dates: e.start_date ? `${e.start_date}${e.end_date ? ` → ${e.end_date}` : ''}` : '',
                    financing: e.financing === 'PROFESSIONNEL' ? 'Entreprise' : 'Particulier',
                    opco: e.opco || null,
                },
                ...parc,
            },
        });
    } catch (err) {
        console.error('Erreur parcours dossier :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
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

module.exports = { getEnrollments, getParcours, createEnrollment, updateEnrollment, deleteEnrollment };
