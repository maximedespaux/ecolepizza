const db = require('../config/database.js');
const { stepsToDocSet } = require('../lib/documents.js');
const { loadOrgSteps } = require('./template.controller.js');

const todayISO = () => new Date().toISOString().slice(0, 10);

// Retrouve le stagiaire (learner) lié au compte connecté.
async function learnerForUser(conn, userId) {
    const [rows] = await conn.query('SELECT * FROM learner WHERE user_id = ? LIMIT 1', [userId]);
    return rows[0] || null;
}

// Complétude d'un dossier : dernier jour passé + documents à signer tous signés.
async function completionOf(conn, e, steps, agefice = false) {
    const [rows] = await conn.query(
        `SELECT gd.type, gd.status
         FROM generated_document gd
         JOIN document_formation df ON df.document_id = gd.id
         WHERE df.enrollment_id = ?`,
        [e.enrollment_id]
    );
    const statusByType = {};
    for (const r of rows) statusByType[r.type] = r.status;

    const required = stepsToDocSet(steps, {
        hygiene: !!e.program_hygiene, rsCode: e.program_rs,
        jours: e.program_days || 1, financing: e.financing, agefice,
    }).filter((d) => d.stagiaireSign);

    const signed = required.filter((d) => statusByType[d.type] === 'SIGNE').length;
    const total = required.length;
    const dayPassed = !!e.end_date && e.end_date <= todayISO();
    const complete = dayPassed && total > 0 && signed === total;
    return { complete, dayPassed, signed, total };
}

/**
 * GET /api/mon-espace — documents ENVOYÉS au stagiaire (à consulter / signer).
 */
const getMonEspace = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: "Aucune fiche stagiaire liée à ce compte." });

        const [documents] = await conn.query(
            `SELECT d.id, d.type, d.title, d.status,
                    DATE_FORMAT(d.sent_at, '%Y-%m-%d %H:%i') AS sent_at,
                    DATE_FORMAT(d.signed_at, '%Y-%m-%d %H:%i') AS signed_at, d.signer_name,
                    GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ', ') AS formations
             FROM generated_document d
             LEFT JOIN document_formation df ON df.document_id = d.id
             LEFT JOIN enrollment e ON e.id = df.enrollment_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE d.learner_id = ? AND d.status IN ('ENVOYE','CONSULTE','SIGNE')
             GROUP BY d.id
             ORDER BY d.sent_at DESC`,
            [learner.id]
        );

        res.json({
            data: {
                learner: {
                    id: learner.id, civility: learner.civility,
                    first_name: learner.first_name, last_name: learner.last_name, email: learner.email,
                },
                documents,
            },
        });
    } catch (err) {
        console.error('Erreur mon-espace :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/formations — une carte PAR formation du catalogue.
 * Toutes les cartes sont visibles ; une carte se déverrouille si le stagiaire a
 * suivi cette formation et qu'elle est complète (dernier jour passé + signée).
 */
const getMyFormations = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: "Aucune fiche stagiaire liée à ce compte." });

        // Catalogue complet des formations de l'organisme.
        const [programs] = await conn.query(
            `SELECT id, code, title, days, hours, hygiene, rs_code
             FROM training_program WHERE organization_id = ? AND active = 1 ORDER BY code`,
            [learner.organization_id]
        );

        // Inscriptions du stagiaire (pour déverrouiller les cartes concernées).
        const [enrollments] = await conn.query(
            `SELECT e.id AS enrollment_id, e.financing, s.program_id, s.year, s.week,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                    p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.learner_id = ?`,
            [learner.id]
        );

        // Meilleure inscription par formation (on privilégie une formation complète).
        const steps = await loadOrgSteps(learner.organization_id);
        const byProgram = {};
        for (const e of enrollments) {
            const c = await completionOf(conn, e, steps, (learner.opco || "").toUpperCase() === "AGEFICE");
            const info = {
                enrollment_id: e.enrollment_id, complete: c.complete, dayPassed: c.dayPassed,
                signed: c.signed, total: c.total, start_date: e.start_date, end_date: e.end_date,
                year: e.year, week: e.week,
            };
            const cur = byProgram[e.program_id];
            if (!cur || (info.complete && !cur.complete)) byProgram[e.program_id] = info;
        }

        const formations = programs.map((p) => {
            const e = byProgram[p.id] || null;
            return {
                program_id: p.id, program_code: p.code, program_title: p.title,
                enrolled: !!e,
                enrollment_id: e ? e.enrollment_id : null,
                complete: e ? e.complete : false,
                dayPassed: e ? e.dayPassed : false,
                signed: e ? e.signed : 0,
                total: e ? e.total : 0,
                start_date: e ? e.start_date : null,
                end_date: e ? e.end_date : null,
                year: e ? e.year : null,
                week: e ? e.week : null,
            };
        });

        res.json({ data: formations });
    } catch (err) {
        console.error('Erreur formations stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/formations/:id — documents d'une formation terminée
 * (accessible uniquement si la formation est complète).
 */
const getMyFormation = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Fiche stagiaire introuvable.' });

        const [rows] = await conn.query(
            `SELECT e.id AS enrollment_id, e.financing,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                    s.year, s.week,
                    p.code AS program_code, p.title AS program_title, p.hours AS program_hours,
                    p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.id = ? AND e.learner_id = ?`,
            [req.params.id, learner.id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Formation introuvable.' });
        const e = rows[0];

        const steps = await loadOrgSteps(learner.organization_id);
        const c = await completionOf(conn, e, steps, (learner.opco || "").toUpperCase() === "AGEFICE");
        if (!c.complete) return res.status(403).json({ message: 'Formation non terminée.' });

        const [documents] = await conn.query(
            `SELECT gd.id, gd.type, gd.title, gd.status,
                    DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at
             FROM generated_document gd
             JOIN document_formation df ON df.document_id = gd.id
             WHERE df.enrollment_id = ?
             ORDER BY gd.created_at`,
            [e.enrollment_id]
        );

        res.json({
            data: {
                program_code: e.program_code, program_title: e.program_title,
                start_date: e.start_date, end_date: e.end_date, year: e.year, week: e.week,
                program_hours: e.program_hours, documents,
            },
        });
    } catch (err) {
        console.error('Erreur formation stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getMonEspace, getMyFormations, getMyFormation };
