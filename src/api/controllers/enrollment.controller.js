const db = require('../config/database.js');
const { computeDocParcours, companyParcours } = require('../lib/parcours.js');
const { getEnabledFields, loadDossierFactsMap, loadConditionMap } = require('../lib/conditions.js');
const { enrollmentSteps, formationSteps } = require('./formationProgram.controller.js');
const { createStagiaireAccount } = require('./learner.controller.js');

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
            `SELECT e.id, e.crm_stage, e.financing, e.session_id, e.company_id,
                    p.id AS program_id, p.title AS program_title, p.code AS program_code,
                    p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs,
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

        const orgId = req.user.organization_id;
        const [docs] = await conn.query(
            `SELECT gd.id, gd.type, gd.status, gd.template_slug, gd.quiz_id FROM generated_document gd
             JOIN document_formation df ON df.document_id = gd.id
             WHERE df.enrollment_id = ?
             ORDER BY gd.created_at DESC`,
            [req.params.id]
        );
        // Stagiaire envoyé par une entreprise : on rattache les documents de GROUPE
        // (scope entreprise) pour que leur statut (signé…) se reflète dans son parcours,
        // même s'ils ne sont pas liés à son inscription.
        // (les documents de groupe sont ajoutés plus bas, avec le parcours entreprise)

        let parc = { steps: [], percent: 0, currentIndex: 0, currentKey: null };
        if (e.program_id) {
            const program = { id: e.program_id, code: e.program_code, days: e.program_days, hygiene: e.program_hygiene, rs_code: e.program_rs };
            const [fieldCatalog, condById] = await Promise.all([
                getEnabledFields(conn, orgId, 'condition'),
                loadConditionMap(conn, orgId),
            ]);
            const factsMap = await loadDossierFactsMap(conn, orgId, [e.id], fieldCatalog);
            const ctx = {
                financing: e.financing, rsCode: e.program_rs, hygiene: !!e.program_hygiene,
                jours: e.program_days, agefice: (e.opco || '').toUpperCase() === 'AGEFICE',
                ...(factsMap.get(e.id) || {}),
            };
            // Inscription via une ENTREPRISE : le stagiaire suit le MÊME parcours que
            // l'entreprise (section « à l'arrivée via une entreprise »), y compris les
            // documents de GROUPE (visibles mais générés côté entreprise). On construit
            // donc les étapes directement depuis la section (toutes présentes), sinon on
            // retombe sur le parcours du dossier « seul ».
            const ent = await companyParcours(conn, orgId,
                { programId: program.id, companyId: e.company_id, sessionId: e.session_id },
                () => formationSteps(conn, orgId, program));
            if (ent.docs.length) docs.push(...ent.docs);
            const steps = ent.steps || await enrollmentSteps(conn, orgId, program, ctx, condById);
            parc = computeDocParcours({ steps, docs });
        }

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
const createEnrollment = async (req, res) => {
    const { learner_id, session_id, company_id, crm_stage = 'PROSPECT' } = req.body;
    if (!learner_id || !session_id) {
        return res.status(422).json({ error: 'Stagiaire et session requis' });
    }
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        // Stagiaire + niveau de la formation de la session.
        const [[l]] = await conn.query(
            'SELECT id, financing, levels, user_id, email, first_name, last_name, phone FROM learner WHERE id = ? AND organization_id = ?',
            [learner_id, orgId]
        );
        // Badge de la formation : son niveau si défini, sinon son code.
        const [[sess]] = await conn.query(
            `SELECT COALESCE(NULLIF(p.level, ''), p.code) AS badge FROM training_session s
             JOIN training_program p ON p.id = s.program_id
             WHERE s.id = ? AND s.organization_id = ?`,
            [session_id, orgId]
        );

        // Le financement (type de devis) suit celui du stagiaire s'il n'est pas fourni.
        let financing = req.body.financing;
        if (financing !== 'PARTICULIER' && financing !== 'PROFESSIONNEL') {
            financing = l && l.financing ? l.financing : 'PARTICULIER';
        }

        await conn.query(
            `INSERT INTO enrollment
                (id, organization_id, learner_id, session_id, company_id, financing, crm_stage, conformite_score)
             VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'ROUGE')`,
            [orgId, learner_id, session_id, company_id || null, financing, crm_stage]
        );

        // À l'inscription : ajoute automatiquement le badge de la formation au stagiaire.
        if (l && sess && sess.badge) {
            const set = new Set((l.levels || '').split(',').map((s) => s.trim()).filter(Boolean));
            if (!set.has(sess.badge)) {
                set.add(sess.badge);
                await conn.query('UPDATE learner SET levels = ? WHERE id = ? AND organization_id = ?',
                    [[...set].join(','), learner_id, orgId]);
            }
        }

        // À l'inscription : garantit un compte de connexion au stagiaire (si e-mail).
        if (l && !l.user_id && l.email) {
            const account = await createStagiaireAccount(conn, orgId, {
                email: l.email, first_name: l.first_name, last_name: l.last_name, phone: l.phone,
            });
            if (account) {
                await conn.query('UPDATE learner SET user_id = ? WHERE id = ? AND organization_id = ?',
                    [account.userId, learner_id, orgId]);
            }
        }

        res.status(201).json({ message: 'Dossier créé' });
    } catch (err) {
        console.error('Erreur création dossier :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/enrollments/:id — retire un stagiaire d'une session.
 */
const deleteEnrollment = async (req, res) => {
    try {
        const conn = db.promise();
        const [[e]] = await conn.query(
            'SELECT id, session_id, learner_id FROM enrollment WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (!e) return res.status(404).json({ message: 'Dossier introuvable' });
        // Retire les présences en cours du stagiaire pour cette session (grille éditable).
        await conn.query(
            `DELETE ar FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id
             WHERE s.session_id = ? AND ar.learner_id = ?`,
            [e.session_id, e.learner_id]
        );
        // NB : on CONSERVE la/les feuille(s) d'émargement archivée(s) (archive_document
        // ref emarg:<id>[:<slug>]) — preuve Qualiopi conservée même après retrait du dossier.
        // Elles restent visibles dans le suivi (rattachées par le nom du stagiaire).
        await conn.query('DELETE FROM enrollment WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        res.status(200).json({ success: true, message: 'Stagiaire retiré' });
    } catch (err) {
        console.error('Erreur suppression dossier :', err);
        res.status(400).json({ message: 'Erreur suppression' });
    }
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
