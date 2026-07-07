const db = require('../config/database.js');
const { stepsToDocSet } = require('../lib/documents.js');
const { loadOrgSteps } = require('./template.controller.js');

const SCORE_ORDER = { ROUGE: 0, ORANGE: 1, VERT: 2 };

/**
 * GET /api/suivi — suivi Qualiopi par dossier (inscription) : jeu de documents
 * requis + statut réel, conformité calculée, dossiers incomplets en premier.
 */
const getSuivi = async (req, res) => {
    try {
        const conn = db.promise();
        const [enrollments] = await conn.query(
            `SELECT e.id AS enrollment_id, e.learner_id, e.financing, e.crm_stage,
                    l.first_name, l.last_name,
                    p.code AS program_code, p.title AS program_title,
                    p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN learner l ON l.id = e.learner_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.organization_id = ?`,
            [req.user.organization_id]
        );

        const steps = await loadOrgSteps(req.user.organization_id);
        const dossiers = [];
        for (const e of enrollments) {
            // Statuts réels des documents rattachés à ce dossier.
            const [rows] = await conn.query(
                `SELECT gd.type, gd.status
                 FROM generated_document gd
                 JOIN document_formation df ON df.document_id = gd.id
                 WHERE df.enrollment_id = ?`,
                [e.enrollment_id]
            );
            const statusByType = {};
            for (const r of rows) statusByType[r.type] = r.status; // dernier gagne

            const required = stepsToDocSet(steps, {
                hygiene: !!e.program_hygiene,
                rsCode: e.program_rs,
                jours: e.program_days || 1,
                financing: e.financing,
            });
            const documents = required.map((d) => ({ ...d, status: statusByType[d.type] || 'A_FAIRE' }));

            // Conformité : VERT si tous les documents à signer sont signés,
            // ORANGE si des documents sont en cours, ROUGE si rien n'est engagé.
            const signable = documents.filter((d) => d.stagiaireSign);
            const signed = signable.filter((d) => d.status === 'SIGNE').length;
            const anyHandled = documents.some((d) => ['GENERE', 'ENVOYE', 'CONSULTE', 'SIGNE'].includes(d.status));
            const score = signable.length > 0 && signed === signable.length
                ? 'VERT'
                : anyHandled ? 'ORANGE' : 'ROUGE';

            dossiers.push({
                enrollment_id: e.enrollment_id,
                learner_id: e.learner_id,
                first_name: e.first_name,
                last_name: e.last_name,
                program_code: e.program_code,
                program_title: e.program_title,
                financing: e.financing,
                crm_stage: e.crm_stage,
                score,
                signed,
                to_sign: signable.length,
                documents,
            });
        }

        // Incomplets en premier (ROUGE, ORANGE puis VERT), puis par nom.
        dossiers.sort((a, b) =>
            (SCORE_ORDER[a.score] - SCORE_ORDER[b.score]) ||
            (a.last_name || '').localeCompare(b.last_name || ''));

        res.json({ data: dossiers });
    } catch (err) {
        console.error('Erreur suivi :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSuivi };
