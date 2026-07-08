const db = require('../config/database.js');
const { computeDocParcours } = require('../lib/parcours.js');
const { formationSteps, enrollmentSteps } = require('./formationProgram.controller.js');

// Libellé court par type de document (colonnes du tableau de session).
const DOC_LABELS = {
    FICHE_SEMAINE: "Fiche d'expression", DEVIS: 'Devis', CGV: 'CGV',
    CONTRAT: 'Contrat', CONVENTION: 'Convention', INVITATION: 'Invitation',
    CONVOCATION: 'Convocation', LIVRET_ACCUEIL: "Livret d'accueil",
    TEST_POSITIONNEMENT: 'Test position.', DROIT_IMAGE: "Droit à l'image",
    EMARGEMENT: 'Émargement', ATTESTATION_HYGIENE: 'Att. hygiène',
    CERTIFICAT_REALISATION: 'Certificat', ATTESTATION_ASSIDUITE: "Att. assiduité",
    DIPLOME: 'Diplôme', EVALUATION_SATISFACTION: 'Éval. satisfaction', PROGRAMME: 'Programme',
};
const DONE_STATUSES = ['GENERE', 'ENVOYE', 'CONSULTE', 'SIGNE'];

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
        const [trainers] = await conn.query(
            `SELECT u.id, u.first_name, u.last_name
             FROM session_trainer st JOIN user u ON u.id = st.user_id
             WHERE st.session_id = ? ORDER BY u.last_name, u.first_name`,
            [req.params.id]
        );
        res.json({ data: { ...rows[0], enrollments, trainers } });
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

/**
 * GET /api/sessions/:id/board — tableau de la session : colonnes = étapes
 * documentaires de la formation ; cartes = stagiaires positionnés sur leur
 * prochain document à faire.
 */
const getSessionBoard = async (req, res) => {
    try {
        const conn = db.promise();
        const [[s]] = await conn.query(
            `SELECT s.id, s.program_id, s.year, s.week,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date,
                    p.code, p.title, p.days, p.hygiene, p.rs_code
             FROM training_session s
             JOIN training_program p ON p.id = s.program_id
             WHERE s.id = ? AND s.organization_id = ?`,
            [req.params.id, req.user.organization_id]
        );
        if (!s) return res.status(404).json({ message: 'Session introuvable' });

        const program = { id: s.program_id, code: s.code, days: s.days, hygiene: s.hygiene, rs_code: s.rs_code };
        // Colonnes = parcours documentaire de la formation (toutes variantes confondues).
        const colSteps = (await formationSteps(conn, req.user.organization_id, program)).filter((st) => st.active);
        const columns = colSteps.map((st, i) => ({
            index: i, key: st.quiz_id ? `quiz:${st.quiz_id}` : st.slug, label: st.label,
            ic: st.quiz_id ? '❓' : (st.stagiaire_sign ? '✍️' : '📄'),
        }));
        const keyIndex = new Map(columns.map((c) => [c.key, c.index]));

        const [enr] = await conn.query(
            `SELECT e.id AS enrollment_id, e.learner_id, e.financing, l.first_name, l.last_name, l.opco
             FROM enrollment e LEFT JOIN learner l ON l.id = e.learner_id
             WHERE e.session_id = ? AND e.organization_id = ?
             ORDER BY l.last_name, l.first_name`,
            [req.params.id, req.user.organization_id]
        );

        const cards = [];
        for (const e of enr) {
            const ctx = {
                financing: e.financing, rsCode: s.rs_code, hygiene: !!s.hygiene,
                jours: s.days, agefice: (e.opco || '').toUpperCase() === 'AGEFICE',
            };
            const steps = await enrollmentSteps(conn, req.user.organization_id, program, ctx);
            const [docs] = await conn.query(
                `SELECT gd.id, gd.type, gd.status, gd.template_slug, gd.quiz_id FROM generated_document gd
                 JOIN document_formation df ON df.document_id = gd.id
                 WHERE df.enrollment_id = ?`,
                [e.enrollment_id]
            );
            const parc = computeDocParcours({ steps, docs });
            const column = parc.currentKey == null
                ? columns.length
                : (keyIndex.has(parc.currentKey) ? keyIndex.get(parc.currentKey) : columns.length);
            cards.push({
                learner_id: e.learner_id, enrollment_id: e.enrollment_id,
                name: `${e.last_name || ''} ${e.first_name || ''}`.trim(),
                column, done: parc.currentIndex, total: steps.length, percent: parc.percent,
            });
        }

        res.json({ data: {
            session: { id: s.id, code: s.code, title: s.title, year: s.year, week: s.week, start_date: s.start_date, end_date: s.end_date },
            columns, cards,
        } });
    } catch (err) {
        console.error('Erreur tableau session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/sessions/trainers — membres de l'équipe pouvant être formateurs.
 */
const listTrainers = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, first_name, last_name, role FROM user
             WHERE organization_id = ? AND active = 1
               AND role IN ('SUPER_ADMIN','ADMIN_ORGANISME','SECRETARIAT','FORMATEUR')
             ORDER BY FIELD(role,'FORMATEUR','SECRETARIAT','ADMIN_ORGANISME','SUPER_ADMIN'), last_name, first_name`,
            [req.user.organization_id]
        );
        res.json({ data: rows });
    } catch (err) {
        console.error('Erreur liste formateurs :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/sessions/:id/trainers — définit les formateurs de la session.
 * Corps : { user_ids: [] }.
 */
const setSessionTrainers = async (req, res) => {
    const ids = Array.isArray(req.body?.user_ids) ? req.body.user_ids : null;
    if (!ids) return res.status(422).json({ error: 'Liste de formateurs requise.' });
    try {
        const conn = db.promise();
        const [[s]] = await conn.query('SELECT id FROM training_session WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!s) return res.status(404).json({ message: 'Session introuvable' });
        await conn.query('DELETE FROM session_trainer WHERE session_id = ?', [req.params.id]);
        for (const uid of ids) {
            // N'accepte que des membres de l'organisme.
            const [[u]] = await conn.query('SELECT id FROM user WHERE id = ? AND organization_id = ?', [uid, req.user.organization_id]);
            if (u) await conn.query('INSERT IGNORE INTO session_trainer (id, session_id, user_id) VALUES (UUID(), ?, ?)', [req.params.id, uid]);
        }
        // Reflète aussi les noms dans le champ texte (compatibilité affichage / documents).
        const [names] = await conn.query(
            `SELECT u.first_name, u.last_name FROM session_trainer st JOIN user u ON u.id = st.user_id WHERE st.session_id = ?`,
            [req.params.id]
        );
        const label = names.map((n) => `${n.first_name || ''} ${n.last_name || ''}`.trim()).filter(Boolean).join(', ') || null;
        await conn.query('UPDATE training_session SET trainer = ? WHERE id = ?', [label, req.params.id]);
        res.json({ success: true, message: 'Formateurs enregistrés.' });
    } catch (err) {
        console.error('Erreur formateurs session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSessions, getSession, createSession, deleteSession, getSessionBoard, listTrainers, setSessionTrainers };
