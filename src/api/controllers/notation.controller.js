const db = require('../config/database.js');
const { fusionner, noteQcm } = require('../lib/notation.js');
const { totalGrille, resultatJury } = require('../lib/bareme.js');
const { grilleDeLaFormation } = require('./evaluation.controller.js');

/**
 * NOTATION — tout ce qu'un stagiaire a obtenu, au même endroit.
 *
 * POURQUOI UN ÉCRAN DE PLUS. Les notes existaient déjà, mais éparpillées : le QCM dans
 * « Résultats QCM », rangé PAR QUESTIONNAIRE ; l'évaluation pratique sur la page de la session ;
 * le jury dans l'espace de l'intervenant. Personne ne pouvait dire « où en est cette personne »
 * sans ouvrir trois écrans et faire l'addition de tête. C'est cette addition qui est ici.
 *
 * LA FUSION EST DANS `lib/notation.js`, pas ici : c'est la seule partie qui puisse se tromper
 * en silence, et elle s'éprouve sans base.
 */

/** Les sessions qui ont quelque chose à noter — les plus récentes d'abord. */
const listSessions = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT s.id, s.year, s.week, p.code, p.title,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date,
                    COUNT(e.id) AS inscrits
               FROM training_session s
               LEFT JOIN training_program p ON p.id = s.program_id
               LEFT JOIN enrollment e ON e.session_id = s.id
              WHERE s.organization_id = ?
              GROUP BY s.id, s.year, s.week, p.code, p.title, s.start_date, s.end_date
              HAVING inscrits > 0
              ORDER BY s.start_date DESC
              LIMIT 60`, [req.user.organization_id]);
        res.json({ data: rows });
    } catch (err) {
        console.error('Erreur liste des sessions à noter :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/notation/session/:id — la note de chaque stagiaire de la session.
 *
 * TROIS SOURCES LUES, DEUX ADDITIONNÉES : le QCM et l'évaluation pratique donnent des points
 * sur un maximum et s'additionnent ; le jury valide des compétences et se lit à côté.
 */
const getSession = async (req, res) => {
    const orgId = req.user.organization_id;
    try {
        const conn = db.promise();
        const [[s]] = await conn.query(
            `SELECT s.id, s.program_id, s.year, s.week, p.code, p.title,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date
               FROM training_session s LEFT JOIN training_program p ON p.id = s.program_id
              WHERE s.id = ? AND s.organization_id = ?`, [req.params.id, orgId]);
        if (!s) return res.status(404).json({ error: 'Session introuvable.' });

        const [enr] = await conn.query(
            `SELECT e.id AS enrollment_id, e.learner_id, l.first_name, l.last_name
               FROM enrollment e LEFT JOIN learner l ON l.id = e.learner_id
              WHERE e.session_id = ? AND e.organization_id = ?
              ORDER BY l.last_name, l.first_name`, [req.params.id, orgId]);
        if (!enr.length) return res.json({ data: { session: s, grilles: {}, stagiaires: [] } });
        const ids = enr.map((e) => e.enrollment_id);

        /* LES QCM NOTÉS SEULEMENT. Une enquête de satisfaction n'a ni bonne réponse ni maximum :
           la proposer ferait annoncer une épreuve « non passée » qui n'en est pas une. */
        const [reponses] = await conn.query(
            `SELECT r.enrollment_id, r.quiz_id, r.score, r.max_score, q.title, q.pass_score,
                    DATE_FORMAT(r.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at
               FROM quiz_response r JOIN quiz q ON q.id = r.quiz_id
              WHERE r.enrollment_id IN (?) AND r.organization_id = ? AND q.kind = 'GRADED'
              ORDER BY r.completed_at DESC`, [ids, orgId]);
        const qcmParDossier = new Map();
        for (const r of reponses) {
            if (!qcmParDossier.has(r.enrollment_id)) qcmParDossier.set(r.enrollment_id, []);
            qcmParDossier.get(r.enrollment_id).push(r);
        }

        /* Les deux grilles de la formation. Tolérant : sans les migrations 148/149, elles sont
           simplement absentes et le total ne porte que sur les QCM. */
        let gFormateur = null;
        let gJury = null;
        try {
            gFormateur = await grilleDeLaFormation(conn, orgId, s.program_id, 'FORMATEUR');
            gJury = await grilleDeLaFormation(conn, orgId, s.program_id, 'JURY');
        } catch (e) { if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; }

        let notes = [];
        if (gFormateur || gJury) {
            try {
                [notes] = await conn.query(
                    'SELECT enrollment_id, exercice_id, points FROM evaluation_note WHERE enrollment_id IN (?)',
                    [ids]);
            } catch (e) { if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; }
        }
        const pointsParDossier = new Map();
        for (const n of notes) {
            if (!pointsParDossier.has(n.enrollment_id)) pointsParDossier.set(n.enrollment_id, {});
            pointsParDossier.get(n.enrollment_id)[n.exercice_id] = n.points;
        }

        let verdicts = new Map();
        if (gJury) {
            try {
                const [vs] = await conn.query(
                    'SELECT enrollment_id, avis, rattrapage, cloture_le FROM evaluation_verdict WHERE grille_id = ? AND enrollment_id IN (?)',
                    [gJury.id, ids]);
                verdicts = new Map(vs.map((v) => [v.enrollment_id, v]));
            } catch (e) { if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; }
        }

        const exFormateur = gFormateur ? gFormateur.exercices.filter((x) => x.active && !x.competence_id) : [];
        const compJury = gJury ? gJury.competences.filter((c) => c.active) : [];

        const stagiaires = enr.map((e) => {
            const pts = pointsParDossier.get(e.enrollment_id) || {};
            const qcm = noteQcm(qcmParDossier.get(e.enrollment_id) || []);
            const evaluation = exFormateur.length ? totalGrille(exFormateur, pts) : null;
            const jury = compJury.length ? resultatJury(compJury, pts) : null;
            /* Les sources ATTENDUES sont celles que la formation prévoit : c'est elles qui
               décident si le total est partiel. Sans cette liste, un stagiaire sans QCM aurait
               l'air complet alors qu'il lui manque une épreuve. */
            const attendues = [gFormateur ? 'evaluation' : null, 'qcm'].filter(Boolean);
            return {
                ...e,
                nom: `${e.last_name || ''} ${e.first_name || ''}`.trim(),
                qcm,
                evaluation,
                jury: jury ? { ...jury, verdict: verdicts.get(e.enrollment_id) || null } : null,
                total: fusionner({ qcm, evaluation }, attendues),
            };
        });

        res.json({ data: {
            session: s,
            grilles: {
                formateur: gFormateur ? { label: gFormateur.label, pass_score: gFormateur.pass_score } : null,
                jury: gJury ? { label: gJury.label, competences: compJury.length } : null,
            },
            stagiaires,
        } });
    } catch (err) {
        console.error('Erreur notation de la session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listSessions, getSession };
