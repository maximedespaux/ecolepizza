const db = require('../config/database.js');
const { formationSteps } = require('./formationProgram.controller.js');

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
        const steps = (await formationSteps(conn, req.user.organization_id, program)).filter((st) => st.active);

        // Colonnes = paliers de sort_order (regroupe les variantes : devis, contrat/convention…).
        const byOrder = new Map();
        const tiers = [];
        for (const st of steps) {
            let t = byOrder.get(st.sort_order);
            if (!t) { t = { order: st.sort_order, types: [], signTypes: [] }; byOrder.set(st.sort_order, t); tiers.push(t); }
            if (!t.types.includes(st.doc_type)) t.types.push(st.doc_type);
            if (st.stagiaire_sign && !t.signTypes.includes(st.doc_type)) t.signTypes.push(st.doc_type);
        }
        tiers.sort((a, b) => a.order - b.order);
        const columns = tiers.map((t, i) => ({
            index: i, key: String(t.order),
            label: [...new Set(t.types.map((d) => DOC_LABELS[d] || d))].join(' / '),
            types: t.types, signTypes: t.signTypes,
        }));

        const [enr] = await conn.query(
            `SELECT e.id AS enrollment_id, e.learner_id, l.first_name, l.last_name
             FROM enrollment e LEFT JOIN learner l ON l.id = e.learner_id
             WHERE e.session_id = ? AND e.organization_id = ?
             ORDER BY l.last_name, l.first_name`,
            [req.params.id, req.user.organization_id]
        );

        const cards = [];
        for (const e of enr) {
            const [docs] = await conn.query(
                `SELECT gd.type, gd.status FROM generated_document gd
                 JOIN document_formation df ON df.document_id = gd.id
                 WHERE df.enrollment_id = ?`,
                [e.enrollment_id]
            );
            const statusByType = {};
            for (const d of docs) statusByType[d.type] = d.status;
            const doneCol = columns.map((c) => c.types.some((tp) => {
                const st = statusByType[tp];
                if (!st) return false;
                return c.signTypes.includes(tp) ? st === 'SIGNE' : DONE_STATUSES.includes(st);
            }));
            const done = doneCol.filter(Boolean).length;
            let column = doneCol.findIndex((d) => !d);
            if (column < 0) column = columns.length; // tout fait
            cards.push({
                learner_id: e.learner_id, enrollment_id: e.enrollment_id,
                name: `${e.last_name || ''} ${e.first_name || ''}`.trim(),
                column, done, total: columns.length,
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

module.exports = { getSessions, getSession, createSession, deleteSession, getSessionBoard };
