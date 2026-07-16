const crypto = require('crypto');
const db = require('../config/database.js');
const { stepsToDocSet, stagiaireSignsDoc, companySignsDoc, matchStep } = require('../lib/documents.js');
const { loadOrgSteps } = require('./template.controller.js');
const { formationSteps } = require('./formationProgram.controller.js');
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

// Accès à l'émargement : point de rupture positionné ENTRE deux jalons du parcours DE LA
// FORMATION (training_program.emargement_break_slug = slug de l'étape juste avant le point).
// Le stagiaire doit avoir signé tous les documents qu'il doit signer situés à/avant ce point
// (par sort_order du parcours de la formation). Aucun point → aucun blocage.
// Renvoie { locked, need, done, break_label }.
async function emargementGate(conn, e, orgId, agefice = false) {
    if (!e.program_id) return { locked: false, need: 0, done: 0, break_label: null };
    let breakSlug = null;
    try {
        const [[p]] = await conn.query('SELECT emargement_break_slug AS bs FROM training_program WHERE id = ?', [e.program_id]);
        breakSlug = p && p.bs ? p.bs : null;
    } catch { breakSlug = null; } // colonne absente (migration 076 non jouée)
    if (!breakSlug) return { locked: false, need: 0, done: 0, break_label: null };

    const program = { id: e.program_id, code: e.program_code, days: e.program_days, hygiene: e.program_hygiene, rs_code: e.program_rs };
    const pSteps = await formationSteps(conn, orgId, program);
    const brk = pSteps.find((s) => s.slug === breakSlug);
    if (!brk) return { locked: false, need: 0, done: 0, break_label: null };
    const threshold = Number(brk.sort_order);

    const ctx = { hygiene: !!e.program_hygiene, rsCode: e.program_rs, jours: e.program_days || 1, financing: e.financing, agefice };
    const required = pSteps.filter((s) => s.active && s.stagiaire_sign
        && s.doc_type !== 'QCM' && s.doc_type !== 'EMARGEMENT'
        && matchStep(s.applies_when || {}, ctx)
        && Number(s.sort_order) <= threshold);
    const break_label = brk.label;
    if (!required.length) return { locked: false, need: 0, done: 0, break_label };

    const [rows] = await conn.query(
        `SELECT gd.type, gd.template_slug, gd.status FROM generated_document gd
         JOIN document_formation df ON df.document_id = gd.id WHERE df.enrollment_id = ?`,
        [e.enrollment_id]
    );
    const statusBySlug = {}, statusByType = {};
    for (const r of rows) { if (r.template_slug) statusBySlug[r.template_slug] = r.status; statusByType[r.type] = r.status; }
    const done = required.filter((s) => statusBySlug[s.slug] === 'SIGNE' || statusByType[s.doc_type] === 'SIGNE').length;
    return { locked: done < required.length, need: required.length, done, break_label };
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
        // Exception : les documents « signés par l'entreprise » quand le stagiaire est
        // rattaché à une entreprise → c'est le représentant qui signe (pas le stagiaire).
        const orgSteps = await loadOrgSteps(req.user.organization_id);
        const hasCompany = !!learner.company_id;
        for (const d of documents) {
            const byCompany = hasCompany && companySignsDoc(orgSteps, d);
            d.company_sign = byCompany;
            d.signable = d.quiz_id ? false : (!byCompany && (d.type === 'EMARGEMENT' || stagiaireSignsDoc(orgSteps, d)));
        }

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
/**
 * GET /api/mon-espace/access — le stagiaire a-t-il franchi le POINT D'ACCÈS (breakpoint
 * émargement) d'au moins une de ses formations ? Sert à débloquer Pizza Quest + Outils &
 * Communauté. Aucune formation avec point d'accès → débloqué (rien à bloquer). En erreur
 * on débloque (fail-open : on ne bloque jamais par bug).
 */
const getMyAccess = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        // Pas de fiche stagiaire (intervenant, staff…) : on ne bloque pas.
        if (!learner) return res.json({ data: { quest_unlocked: true } });
        const [enrollments] = await conn.query(
            `SELECT e.id AS enrollment_id, e.financing, s.program_id,
                    DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date,
                    p.code AS program_code, p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.learner_id = ?`,
            [learner.id]
        );
        const agefice = (learner.opco || '').toUpperCase() === 'AGEFICE';
        // Au moins une formation TERMINÉE (marquée manuellement OU complétée auto) → débloqué,
        // même sans point d'accès franchi (cas des personnes déjà venues / déjà formées).
        const doneSet = new Set(String(learner.completed_levels || '').split(',').map((s) => s.trim()).filter(Boolean));
        let finished = doneSet.size > 0;
        if (!finished && enrollments.length) {
            const steps = await loadOrgSteps(learner.organization_id);
            for (const e of enrollments) {
                const c = await completionOf(conn, e, steps, agefice);
                if (c.complete) { finished = true; break; }
            }
        }
        if (finished) return res.json({ data: { quest_unlocked: true } });

        // AUCUNE formation → verrouillé (rien à débloquer tant qu'il n'est pas inscrit).
        if (!enrollments.length) return res.json({ data: { quest_unlocked: false } });
        const gating = [];
        for (const e of enrollments) {
            const g = await emargementGate(conn, e, learner.organization_id, agefice);
            if (g.need > 0) gating.push(g);
        }
        // Inscrit : débloqué si aucune formation n'a de point d'accès, ou si au moins un est franchi.
        const quest_unlocked = gating.length === 0 || gating.some((g) => !g.locked);
        res.json({ data: { quest_unlocked } });
    } catch (err) {
        console.error('Erreur accès stagiaire :', err);
        res.json({ data: { quest_unlocked: true } });
    }
};

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
                    p.code AS program_code, p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.learner_id = ?`,
            [learner.id]
        );

        // Une carte par formation ; on ouvre par défaut la session la plus RÉCENTE.
        // On compte aussi le nombre de sessions suivies (onglets dans le détail).
        const agefice = (learner.opco || "").toUpperCase() === "AGEFICE";
        const steps = await loadOrgSteps(learner.organization_id);
        const byProgram = {};
        for (const e of enrollments) {
            const c = await completionOf(conn, e, steps, agefice);
            const g = await emargementGate(conn, e, learner.organization_id, agefice); // point d'accès (breakpoint)
            const info = {
                enrollment_id: e.enrollment_id, complete: c.complete, dayPassed: c.dayPassed,
                signed: c.signed, total: c.total, start_date: e.start_date, end_date: e.end_date,
                year: e.year, week: e.week, gate_need: g.need, gate_locked: g.locked,
            };
            const cur = byProgram[e.program_id];
            if (!cur) byProgram[e.program_id] = { ...info, session_count: 1 };
            else {
                cur.session_count += 1;
                if ((e.start_date || '') > (cur.start_date || '')) byProgram[e.program_id] = { ...info, session_count: cur.session_count };
            }
        }

        // Badges du stagiaire (codes/niveaux de formation attachés à sa fiche) :
        // ils débloquent le niveau correspondant dans Pizza Quest.
        const badgeSet = new Set(String(learner.levels || '').split(',').map((s) => s.trim()).filter(Boolean));
        // Formations marquées TERMINÉES manuellement (migration 094, colonne optionnelle).
        const doneSet = new Set(String(learner.completed_levels || '').split(',').map((s) => s.trim()).filter(Boolean));
        const formations = programs.map((p) => {
            const e = byProgram[p.id] || null;
            const badge = (p.level && String(p.level).trim()) || p.code;
            const hasBadge = badgeSet.has(badge) || badgeSet.has(p.code);
            // Terminée = marquée manuellement OU complétion auto des documents.
            const finished = doneSet.has(badge) || doneSet.has(p.code) || !!(e && e.complete);
            // RÉVOQUÉE : session commencée + point d'accès (breakpoint) NON franchi + non terminée.
            // → retire le badge (niveau) et l'accès à la formation dans « Mes documents ».
            const sessionStarted = !!(e && e.start_date && e.start_date <= todayISO());
            const revoked = !!e && sessionStarted && (e.gate_need || 0) > 0 && !!e.gate_locked && !finished;
            return {
                program_id: p.id, program_code: p.code, program_title: p.title,
                // Descriptif (aperçu lecture seule).
                level: p.level, color: p.color, days: p.days, hours: p.hours, price: p.price,
                hygiene: p.hygiene, rs_code: p.rs_code,
                audience: p.audience, objectives: p.objectives, objective_general: p.objective_general,
                duration_detail: p.duration_detail, program_detail: p.program_detail,
                enrolled: !!e, has_badge: hasBadge, finished, revoked,
                enrollment_id: e ? e.enrollment_id : null,
                complete: e ? e.complete : false,
                dayPassed: e ? e.dayPassed : false,
                signed: e ? e.signed : 0,
                total: e ? e.total : 0,
                start_date: e ? e.start_date : null,
                end_date: e ? e.end_date : null,
                year: e ? e.year : null,
                week: e ? e.week : null,
                session_count: e ? e.session_count : 0,
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
            `SELECT e.id AS enrollment_id, e.financing, e.session_id, s.program_id,
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
        const agefice = (learner.opco || "").toUpperCase() === "AGEFICE";
        const c = await completionOf(conn, e, steps, agefice);
        const gate = await emargementGate(conn, e, learner.organization_id, agefice);

        // Sessions du MÊME programme suivies par ce stagiaire (onglets W23 / W25…).
        const [sessions] = e.session_id ? await conn.query(
            `SELECT e2.id AS enrollment_id, s2.year, s2.week,
                    DATE_FORMAT(s2.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s2.end_date,   '%Y-%m-%d') AS end_date
             FROM enrollment e2
             JOIN training_session s2 ON s2.id = e2.session_id
             WHERE e2.learner_id = ? AND s2.program_id = (SELECT program_id FROM training_session WHERE id = ?)
             ORDER BY s2.start_date DESC, s2.year DESC, s2.week DESC`,
            [learner.id, e.session_id]
        ) : [[]];

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
                enrollment_id: e.enrollment_id,
                sessions,
                emargement_gate: gate, // { locked, need, done, break_label }
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
const AVATAR_IDS = new Set(['pizza','chef','flame','wheat','tomato','cheese','olive','chili','mushroom','bread','chef2','chef3','basil','oven',
    'burger','fries','pasta','salad','egg','bacon','shrimp','sushi','taco','hotdog','sandwich','croissant','pretzel','avocado','pepper','corn','grapes','lemon','icecream','coffee']);

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
        if (avatar != null && avatar !== '') {
            const [id, color] = String(avatar).split('|'); // "id" ou "id|#rrggbb"
            if (!AVATAR_IDS.has(id)) return res.status(422).json({ message: 'Avatar inconnu.' });
            if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(422).json({ message: 'Couleur invalide.' });
        }
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

// --- Infos personnelles du stagiaire (modifiables par lui, visibles de l'organisme) ---
// Champs que le stagiaire peut mettre à jour lui-même (l'e-mail et le mot de passe passent par /auth).
const INFO_FIELDS = ['civility', 'first_name', 'last_name', 'phone', 'birth_place'];
const clean = (v) => (v == null ? null : String(v).trim().slice(0, 255) || null);

// Visibilité du profil communauté : ce que les autres stagiaires peuvent voir.
// Par défaut : entreprise visible, téléphone et e-mail masqués.
const parseVisibility = (raw) => {
    let v = raw; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    v = v || {};
    return { company: v.company !== false, phone: v.phone === true, email: v.email === true };
};

/** GET /api/mon-espace/infos — infos personnelles + entreprise + réglages de visibilité. */
const getMyInfos = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        const [[u]] = await conn.query('SELECT email FROM user WHERE id = ?', [req.user.id]);
        const base = { email: (u && u.email) || '' };
        INFO_FIELDS.forEach((f) => { base[f] = (learner && learner[f]) || ''; });
        base.birthday = learner && learner.birthday ? new Date(learner.birthday).toISOString().slice(0, 10) : '';
        // Entreprise (modifiable par le stagiaire) + visibilité.
        base.company = ''; base.company_address = ''; base.company_zip = ''; base.company_town = '';
        base.visibility = parseVisibility(null);
        if (learner && learner.company_id) {
            try {
                const [[c]] = await conn.query('SELECT name, address, zip_code, town FROM company WHERE id = ?', [learner.company_id]);
                if (c) { base.company = c.name || ''; base.company_address = c.address || ''; base.company_zip = c.zip_code || ''; base.company_town = c.town || ''; }
            } catch { /* ignore */ }
        }
        try { const [[lv]] = await conn.query('SELECT profile_visibility FROM learner WHERE id = ?', [learner ? learner.id : null]); if (lv) base.visibility = parseVisibility(lv.profile_visibility); } catch { /* migration 075 non jouée */ }
        res.json({ data: base });
    } catch (err) {
        console.error('Erreur lecture infos stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mon-espace/visibility — enregistre ce que les autres stagiaires voient. */
const updateMyVisibility = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.json({ success: true });
        const vis = parseVisibility(req.body && req.body.visibility);
        try {
            await conn.query('UPDATE learner SET profile_visibility = ? WHERE id = ?', [JSON.stringify(vis), learner.id]);
        } catch (e) { return res.status(422).json({ message: 'Réglage de visibilité non initialisé (migration 075).' }); }
        res.json({ success: true, visibility: vis });
    } catch (err) {
        console.error('Erreur visibilité profil :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mon-espace/infos — met à jour les infos perso (learner + user, donc visibles de l'organisme). */
const updateMyInfos = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        const b = req.body || {};
        const vals = {};
        INFO_FIELDS.forEach((f) => { if (b[f] !== undefined) vals[f] = clean(b[f]); });
        const birthday = b.birthday !== undefined ? (b.birthday ? String(b.birthday).slice(0, 10) : null) : undefined;
        if (learner) {
            const sets = Object.keys(vals).map((f) => `${f} = ?`);
            const params = Object.values(vals);
            if (birthday !== undefined) { sets.push('birthday = ?'); params.push(birthday); }
            if (sets.length) await conn.query(`UPDATE learner SET ${sets.join(', ')} WHERE id = ?`, [...params, learner.id]);
        }
        // Miroir sur le compte utilisateur (certaines vues organisme s'appuient dessus).
        const uSets = []; const uParams = [];
        if (vals.first_name !== undefined) { uSets.push('first_name = ?'); uParams.push(vals.first_name); }
        if (vals.last_name !== undefined) { uSets.push('last_name = ?'); uParams.push(vals.last_name); }
        if (vals.phone !== undefined) { uSets.push('phone = ?'); uParams.push(vals.phone); }
        if (uSets.length) await conn.query(`UPDATE user SET ${uSets.join(', ')} WHERE id = ?`, [...uParams, req.user.id]);
        // Entreprise du stagiaire : mise à jour, ou création si aucune n'est encore liée.
        if (learner) {
            const cvals = {};
            if (b.company_name !== undefined) cvals.name = clean(b.company_name);
            if (b.company_address !== undefined) cvals.address = clean(b.company_address);
            if (b.company_zip !== undefined) cvals.zip_code = clean(b.company_zip);
            if (b.company_town !== undefined) cvals.town = clean(b.company_town);
            if (Object.keys(cvals).length) {
                if (learner.company_id) {
                    const cs = Object.keys(cvals).map((k) => `${k} = ?`);
                    await conn.query(`UPDATE company SET ${cs.join(', ')} WHERE id = ?`, [...Object.values(cvals), learner.company_id]);
                } else if (cvals.name) {
                    const cid = crypto.randomUUID();
                    const cols = Object.keys(cvals);
                    await conn.query(
                        `INSERT INTO company (id, organization_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
                        [cid, learner.organization_id, ...Object.values(cvals)]);
                    await conn.query('UPDATE learner SET company_id = ? WHERE id = ?', [cid, learner.id]);
                }
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur mise à jour infos stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getMonEspace, getMyAccess, getMyFormations, getMyFormation, getMyEmargement, signMyEmargement, getMyProfile, saveMyAvatar, saveMyQuest, getMyInfos, updateMyInfos, updateMyVisibility };
