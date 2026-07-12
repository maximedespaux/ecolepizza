const crypto = require('crypto');
const db = require('../config/database.js');
const { stepsToDocSet, stagiaireSignsDoc } = require('../lib/documents.js');
const { loadOrgSteps } = require('./template.controller.js');
const { regenEmargement } = require('../lib/emargement.js');
const { encrypt } = require('../lib/crypto.js');

const todayISO = () => new Date().toISOString().slice(0, 10);

// Date (YYYY-MM-DD) du jour ouvré N à partir d'une date de début (offset = N-1).
function businessDayISO(startStr, offset) {
    if (!startStr) return null;
    const d = new Date(startStr);
    if (Number.isNaN(d.getTime())) return null;
    let added = 0;
    while (added < offset) {
        d.setDate(d.getDate() + 1);
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) added += 1;
    }
    return d.toISOString().slice(0, 10);
}

// Date où le QCM doit être rempli : day>=1 = jour ouvré du stage ;
// day<=0 = |day| jours calendaires avant le début (test de positionnement, etc.).
function quizDayDate(startStr, day) {
    if (!startStr || day == null || day === '') return null;
    const d = Number(day);
    if (!Number.isFinite(d)) return null;
    if (d < 0) {
        const dt = new Date(startStr);
        if (Number.isNaN(dt.getTime())) return null;
        dt.setDate(dt.getDate() + d);
        return dt.toISOString().slice(0, 10);
    }
    return businessDayISO(startStr, d <= 1 ? 0 : d - 1);
}

// Matérialise les QCM « auto » dont le jour de formation est arrivé (envoi paresseux).
async function releaseAutoQuizzes(conn, learner) {
    const [enr] = await conn.query(
        `SELECT e.id AS enrollment_id, s.program_id, DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date
         FROM enrollment e JOIN training_session s ON s.id = e.session_id
         WHERE e.learner_id = ? AND s.program_id IS NOT NULL`,
        [learner.id]
    );
    if (!enr.length) return;
    const progIds = [...new Set(enr.map((e) => e.program_id))];
    const [quizzes] = await conn.query(
        `SELECT id, program_id, day, title FROM quiz
         WHERE organization_id = ? AND active = 1 AND auto_send = 1 AND day IS NOT NULL AND program_id IN (?)`,
        [learner.organization_id, progIds]
    );
    const today = todayISO();
    for (const q of quizzes) {
        for (const e of enr) {
            if (e.program_id !== q.program_id) continue;
            const dayDate = quizDayDate(e.start_date, q.day);
            if (!dayDate || dayDate > today) continue; // pas encore le jour J
            const [[ex]] = await conn.query(
                `SELECT gd.id FROM generated_document gd JOIN document_formation df ON df.document_id = gd.id
                 WHERE gd.quiz_id = ? AND df.enrollment_id = ? LIMIT 1`,
                [q.id, e.enrollment_id]
            );
            if (ex) continue;
            const docId = crypto.randomUUID();
            await conn.query(
                `INSERT INTO generated_document (id, organization_id, learner_id, type, quiz_id, title, status, sent_at)
                 VALUES (?, ?, ?, 'QCM', ?, ?, 'ENVOYE', NOW())`,
                [docId, learner.organization_id, learner.id, q.id, q.title]
            );
            await conn.query('INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)', [docId, e.enrollment_id]);
        }
    }
}

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

        await releaseAutoQuizzes(conn, learner); // matérialise les QCM du jour (auto)

        const [documents] = await conn.query(
            `SELECT d.id, d.type, d.template_slug, d.title, d.status, d.quiz_id,
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

        // Le stagiaire doit-il signer chaque document ? Piloté par le modèle (Modeles).
        const orgSteps = await loadOrgSteps(req.user.organization_id);
        for (const d of documents) d.signable = d.quiz_id ? false : (d.type === 'EMARGEMENT' || stagiaireSignsDoc(orgSteps, d));

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

        // Catalogue complet des formations de l'organisme (avec le descriptif,
        // pour l'aperçu en lecture seule des formations non suivies).
        const [programs] = await conn.query(
            `SELECT id, code, title, level, color, days, hours, price, hygiene, rs_code,
                    audience, objectives, objective_general, duration_detail, program_detail
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
                // Descriptif (aperçu lecture seule).
                level: p.level, color: p.color, days: p.days, hours: p.hours, price: p.price,
                hygiene: p.hygiene, rs_code: p.rs_code,
                audience: p.audience, objectives: p.objectives, objective_general: p.objective_general,
                duration_detail: p.duration_detail, program_detail: p.program_detail,
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
            `SELECT e.id AS enrollment_id, e.financing, e.session_id,
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

        // Accès dès l'inscription à une session (plus besoin que la formation soit terminée).
        const steps = await loadOrgSteps(learner.organization_id);
        const c = await completionOf(conn, e, steps, (learner.opco || "").toUpperCase() === "AGEFICE");

        // Tous les documents partagés du dossier (envoyés / consultés / signés).
        const [documents] = await conn.query(
            `SELECT gd.id, gd.type, gd.title, gd.status, gd.quiz_id,
                    DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at
             FROM generated_document gd
             JOIN document_formation df ON df.document_id = gd.id
             WHERE df.enrollment_id = ? AND gd.status IN ('ENVOYE','CONSULTE','SIGNE')
             ORDER BY gd.created_at`,
            [e.enrollment_id]
        );

        // Émargement de la session (demi-journées à signer par le stagiaire).
        const [emargement] = e.session_id ? await conn.query(
            `SELECT ar.id AS record_id, (ar.signature_data IS NOT NULL) AS signed,
                    DATE_FORMAT(ar.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    DATE_FORMAT(sh.date, '%Y-%m-%d') AS date, sh.slot
             FROM attendance_record ar
             JOIN attendance_sheet sh ON sh.id = ar.sheet_id
             WHERE ar.learner_id = ? AND sh.session_id = ?
             ORDER BY sh.date, FIELD(sh.slot, 'MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL')`,
            [learner.id, e.session_id]
        ) : [[]];

        res.json({
            data: {
                program_code: e.program_code, program_title: e.program_title,
                start_date: e.start_date, end_date: e.end_date, year: e.year, week: e.week,
                program_hours: e.program_hours,
                complete: c.complete, signed: c.signed, total: c.total,
                today: todayISO(),
                documents, emargement,
            },
        });
    } catch (err) {
        console.error('Erreur formation stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/emargement — demi-journées d'émargement du stagiaire
 * (ses sessions), avec l'état de sa signature.
 */
const getMyEmargement = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: "Aucune fiche stagiaire liée à ce compte." });
        const [rows] = await conn.query(
            `SELECT ar.id AS record_id, ar.present,
                    (ar.signature_data IS NOT NULL) AS signed, ar.signer_name,
                    DATE_FORMAT(ar.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    DATE_FORMAT(s.date, '%Y-%m-%d') AS date, s.slot, s.session_id,
                    p.code AS program_code, p.title AS program_title
             FROM attendance_record ar
             JOIN attendance_sheet s ON s.id = ar.sheet_id
             JOIN training_session ts ON ts.id = s.session_id
             LEFT JOIN training_program p ON p.id = ts.program_id
             WHERE ar.learner_id = ?
             ORDER BY s.date, FIELD(s.slot, 'MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL')`,
            [learner.id]
        );
        res.json({ data: { today: todayISO(), records: rows } });
    } catch (err) {
        console.error('Erreur émargement stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/mon-espace/emargement/:recordId/sign — le stagiaire signe sa présence
 * pour une demi-journée. Corps : { signature_data, signer_name? }.
 */
const signMyEmargement = async (req, res) => {
    const { signature_data, signer_name } = req.body || {};
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Fiche stagiaire introuvable.' });
        const [[rec]] = await conn.query(
            `SELECT ar.id, s.session_id, DATE_FORMAT(s.date, '%Y-%m-%d') AS date
             FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id
             WHERE ar.id = ? AND ar.learner_id = ?`,
            [req.params.recordId, learner.id]
        );
        if (!rec) return res.status(404).json({ message: 'Émargement introuvable.' });
        if (rec.date > todayISO()) return res.status(400).json({ message: 'Impossible de signer une demi-journée à venir.' });
        const name = (signer_name && signer_name.trim()) || `${learner.first_name || ''} ${learner.last_name || ''}`.trim();
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || null;
        const ua = (req.headers['user-agent'] || '').slice(0, 400);
        await conn.query(
            'UPDATE attendance_record SET present = 1, signed_at = NOW(), signer_name = ?, signature_data = ?, signer_ip = ?, signer_user_agent = ? WHERE id = ?',
            [name, encrypt(signature_data || null), encrypt(ip), encrypt(ua), req.params.recordId]
        );
        res.json({ success: true, message: 'Émargement signé.' });

        // Met à jour la feuille d'émargement archivée du dossier (non bloquant).
        const [[enr]] = await conn.query('SELECT id FROM enrollment WHERE session_id = ? AND learner_id = ? LIMIT 1', [rec.session_id, learner.id]);
        if (enr) regenEmargement(conn, learner.organization_id, enr.id).catch(() => {});
    } catch (err) {
        console.error('Erreur signature émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// --- Profil ludique du stagiaire (avatar + progression Pizza Quest) ---
// Persistance en base de ce qui vivait en localStorage. Tolérant à l'absence de la
// migration 070 (renvoie un profil vide / no-op au lieu d'échouer).

const isMissingSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');
const AVATAR_IDS = new Set(['pizza','chef','flame','wheat','tomato','cheese','olive','chili','mushroom','bread','chef2','chef3','basil','oven']);

/** GET /api/mon-espace/profile — avatar + progression { world: { step: stars } } + XP. */
const getMyProfile = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: "Aucune fiche stagiaire liée à ce compte." });
        let avatar = null, progress = {}, xp = 0, stars = 0;
        try {
            const [[l]] = await conn.query('SELECT avatar FROM learner WHERE id = ?', [learner.id]);
            avatar = (l && l.avatar) || null;
            const [rows] = await conn.query('SELECT world, step, stars FROM learner_quest_progress WHERE learner_id = ?', [learner.id]);
            for (const r of rows) {
                (progress[r.world] ||= {})[r.step] = r.stars;
                stars += r.stars; xp += r.stars * 10;
            }
        } catch (e) { if (!isMissingSchema(e)) throw e; } // migration 070 non jouée : profil vide
        res.json({ data: { avatar, progress, xp, stars } });
    } catch (err) {
        console.error('Erreur profil stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mon-espace/avatar — { avatar }. */
const saveMyAvatar = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        const avatar = req.body && req.body.avatar;
        if (avatar != null && avatar !== '' && !AVATAR_IDS.has(avatar)) return res.status(422).json({ message: 'Avatar inconnu.' });
        try { await conn.query('UPDATE learner SET avatar = ? WHERE id = ?', [avatar || null, learner.id]); }
        catch (e) { if (!isMissingSchema(e)) throw e; }
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur avatar stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mon-espace/quest — { progress: { world: { step: stars } } } (upsert, meilleur score). */
const saveMyQuest = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        const progress = (req.body && req.body.progress) || {};
        try {
            for (const [world, steps] of Object.entries(progress)) {
                if (!steps || typeof steps !== 'object') continue;
                for (const [step, starsRaw] of Object.entries(steps)) {
                    const stars = Math.max(0, Math.min(3, parseInt(starsRaw, 10) || 0));
                    await conn.query(
                        `INSERT INTO learner_quest_progress (id, organization_id, learner_id, world, step, stars)
                         VALUES (?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE stars = GREATEST(stars, VALUES(stars))`,
                        [crypto.randomUUID(), learner.organization_id, learner.id, String(world).slice(0, 60), String(step).slice(0, 60), stars]
                    );
                }
            }
        } catch (e) { if (!isMissingSchema(e)) throw e; } // migration 070 non jouée : no-op
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur progression Pizza Quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getMonEspace, getMyFormations, getMyFormation, getMyEmargement, signMyEmargement, getMyProfile, saveMyAvatar, saveMyQuest };
