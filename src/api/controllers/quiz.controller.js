const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'];
const GRID_TYPES = new Set(['GRID_SINGLE', 'GRID_MULTI']);
const parseJSON = (v, dflt) => { if (v == null || v === '') return dflt; try { const x = JSON.parse(v); return x == null ? dflt : x; } catch { return dflt; } };

// Lignes des questions « grille » (quiz_row). Renvoie { [questionId]: [{id,text,correct:[positions]}] }.
// `withCorrect` = false pour la passation (on ne révèle pas les bonnes réponses).
async function loadGridRows(conn, qids, withCorrect) {
    const byQ = {};
    if (!qids.length) return byQ;
    let rows;
    try {
        [rows] = await conn.query('SELECT id, question_id, position, text, correct, points FROM quiz_row WHERE question_id IN (?) ORDER BY position', [qids]);
    } catch (e) {
        if (e && e.code === 'ER_BAD_FIELD_ERROR') { // colonne points absente (migration 064)
            try { [rows] = await conn.query('SELECT id, question_id, position, text, correct FROM quiz_row WHERE question_id IN (?) ORDER BY position', [qids]); }
            catch (e2) { if (e2 && e2.code === 'ER_NO_SUCH_TABLE') return byQ; throw e2; }
        } else if (e && e.code === 'ER_NO_SUCH_TABLE') { return byQ; }
        else throw e;
    }
    for (const r of rows) {
        const base = withCorrect
            ? { id: r.id, text: r.text, correct: parseJSON(r.correct, []), points: r.points != null ? r.points : 1 }
            : { id: r.id, text: r.text };
        (byQ[r.question_id] = byQ[r.question_id] || []).push(base);
    }
    return byQ;
}

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

// Date où le QCM doit être rempli, selon le jour paramétré :
//  · day >= 1 : jour ouvré `day` de la session (J1 = premier jour) ;
//  · day <= 0 : |day| jours calendaires AVANT le début (J-3 = 3 jours avant).
function quizDayDate(startStr, day) {
    if (!startStr || day == null || day === '') return null;
    const d = Number(day);
    if (!Number.isFinite(d)) return null;
    if (d < 0) {
        const dt = new Date(startStr);
        if (Number.isNaN(dt.getTime())) return null;
        dt.setDate(dt.getDate() + d);          // d négatif → avant le début
        return dt.toISOString().slice(0, 10);
    }
    return businessDayISO(startStr, d <= 1 ? 0 : d - 1);
}

// Sessions de la formation où le QCM peut être envoyé AUJOURD'HUI :
// le jour J est arrivé (dayDate <= today) et la session n'est pas terminée.
async function eligibleSessionsFor(conn, orgId, programId, day) {
    if (!programId || day == null || day === '') return [];
    const [sessions] = await conn.query(
        `SELECT s.id, DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date
         FROM training_session s
         WHERE s.organization_id = ? AND s.program_id = ?`,
        [orgId, programId]
    );
    const today = todayISO();
    return sessions.filter((s) => {
        const dayDate = quizDayDate(s.start_date, day);
        if (!dayDate) return false;
        if (dayDate > today) return false;                 // le jour J n'est pas encore arrivé
        if (s.end_date && s.end_date < today) return false; // session terminée
        return true;
    });
}

/* ------------------------------ Administration ------------------------------ */

/** GET /api/quizzes — liste des QCM de l'organisme. */
const listQuizzes = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT q.id, q.title, q.kind, q.day, q.auto_send, q.pass_score, q.active, q.program_id,
                    p.code AS program_code, p.title AS program_title,
                    (SELECT COUNT(*) FROM quiz_question qq WHERE qq.quiz_id = q.id) AS n_questions
             FROM quiz q LEFT JOIN training_program p ON p.id = q.program_id
             WHERE q.organization_id = ? ORDER BY q.created_at DESC`,
            [req.user.organization_id]
        );
        // Calcule, pour chaque QCM, s'il est envoyable aujourd'hui (session du bon jour).
        for (const q of rows) {
            let eligible_count = 0, send_reason = null;
            if (!q.program_id) send_reason = 'Rattachez ce QCM à une formation.';
            else if (q.day == null) send_reason = 'Définissez le jour de la formation.';
            else {
                const sessions = await eligibleSessionsFor(conn, req.user.organization_id, q.program_id, q.day);
                if (!sessions.length) send_reason = `Aucune session de ${q.program_code || 'cette formation'} au jour ${q.day} en cours aujourd'hui.`;
                else {
                    const [[c]] = await conn.query('SELECT COUNT(*) AS n FROM enrollment WHERE session_id IN (?)', [sessions.map((s) => s.id)]);
                    eligible_count = c.n;
                    if (!eligible_count) send_reason = 'Aucun stagiaire inscrit sur la session concernée.';
                }
            }
            q.eligible_count = eligible_count;
            q.sendable = eligible_count > 0;
            q.send_reason = send_reason;
        }
        res.json({ data: rows });
    } catch (err) {
        console.error('Erreur liste QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/quizzes/:id — QCM complet (questions + options avec réponses). */
const getQuiz = async (req, res) => {
    try {
        const conn = db.promise();
        const [[quiz]] = await conn.query('SELECT * FROM quiz WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!quiz) return res.status(404).json({ message: 'QCM introuvable' });
        let questions;
        try {
            [questions] = await conn.query('SELECT id, position, text, type, scale_max, points, partial_scoring, image FROM quiz_question WHERE quiz_id = ? ORDER BY position', [quiz.id]);
        } catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR') { // colonne image absente (migration 062)
                [questions] = await conn.query('SELECT id, position, text, type, scale_max, points, partial_scoring FROM quiz_question WHERE quiz_id = ? ORDER BY position', [quiz.id]);
            } else { throw e; }
        }
        const qids = questions.map((q) => q.id);
        let options = [];
        if (qids.length) {
            [options] = await conn.query('SELECT id, question_id, position, text, is_correct FROM quiz_option WHERE question_id IN (?) ORDER BY position', [qids]);
        }
        const byQ = {};
        for (const o of options) (byQ[o.question_id] = byQ[o.question_id] || []).push({ id: o.id, text: o.text, is_correct: !!o.is_correct });
        const gridQids = questions.filter((q) => GRID_TYPES.has(q.type)).map((q) => q.id);
        const rowsByQ = await loadGridRows(conn, gridQids, true);
        res.json({ data: { ...quiz, questions: questions.map((q) => ({ ...q, options: byQ[q.id] || [], rows: rowsByQ[q.id] || [] })) } });
    } catch (err) {
        console.error('Erreur lecture QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/quizzes — crée un QCM (métadonnées). */
const createQuiz = async (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(422).json({ error: 'Titre requis.' });
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO quiz (id, organization_id, program_id, day, auto_send, title, kind, pass_score, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [id, req.user.organization_id, b.program_id || null,
             b.day != null && b.day !== '' ? Number(b.day) : null, b.auto_send ? 1 : 0,
             String(b.title).slice(0, 255),
             b.kind === 'SURVEY' ? 'SURVEY' : 'GRADED', b.pass_score != null && b.pass_score !== '' ? Number(b.pass_score) : null]
        );
        logAudit(req, 'quiz.create', 'Quiz', id);
        res.status(201).json({ id, message: 'QCM créé' });
    } catch (err) {
        console.error('Erreur création QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/quizzes/:id — enregistre le QCM complet (métadonnées + questions + options). */
const saveQuiz = async (req, res) => {
    const b = req.body || {};
    try {
        const conn = db.promise();
        const [[quiz]] = await conn.query('SELECT id FROM quiz WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!quiz) return res.status(404).json({ message: 'QCM introuvable' });

        await conn.query(
            `UPDATE quiz SET title = ?, kind = ?, program_id = ?, day = ?, auto_send = ?, pass_score = ?, active = ? WHERE id = ?`,
            [String(b.title || '').slice(0, 255), b.kind === 'SURVEY' ? 'SURVEY' : 'GRADED',
             b.program_id || null, b.day != null && b.day !== '' ? Number(b.day) : null, b.auto_send ? 1 : 0,
             b.pass_score != null && b.pass_score !== '' ? Number(b.pass_score) : null,
             b.active === false ? 0 : 1, req.params.id]
        );
        // Remplace questions + options + lignes de grille.
        try { await conn.query('DELETE qr FROM quiz_row qr JOIN quiz_question qq ON qq.id = qr.question_id WHERE qq.quiz_id = ?', [req.params.id]); }
        catch (e) { if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; }
        await conn.query('DELETE FROM quiz_question WHERE quiz_id = ?', [req.params.id]);
        // La colonne image existe-t-elle ? (migration 062) — sinon on insère sans.
        let hasImage = true;
        try { await conn.query('SELECT image FROM quiz_question LIMIT 1'); }
        catch (e) { if (e && e.code === 'ER_BAD_FIELD_ERROR') hasImage = false; else throw e; }
        // Colonne points de ligne présente ? (migration 064)
        let hasRowPoints = true;
        try { await conn.query('SELECT points FROM quiz_row LIMIT 1'); }
        catch (e) { if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE')) hasRowPoints = false; else throw e; }
        const questions = Array.isArray(b.questions) ? b.questions : [];
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.text || !String(q.text).trim()) continue;
            const qid = crypto.randomUUID();
            const qType = ['SINGLE', 'MULTI', 'SCALE', 'GRID_SINGLE', 'GRID_MULTI'].includes(q.type) ? q.type : 'SINGLE';
            // Points : on autorise 0 (question sans note / informative).
            const pts = Number(q.points);
            const points = Number.isFinite(pts) && pts >= 0 ? Math.floor(pts) : 1;
            // « Points par bonne réponse » : pertinent seulement pour les QCM (MULTI).
            const partial = qType === 'MULTI' && q.partial_scoring ? 1 : 0;
            const img = q.image && /^data:image\//.test(q.image) ? q.image : null;
            if (hasImage) {
                await conn.query(
                    `INSERT INTO quiz_question (id, quiz_id, position, text, type, scale_max, points, partial_scoring, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [qid, req.params.id, i, String(q.text).slice(0, 2000), qType, Number(q.scale_max) || 5, points, partial, img]
                );
            } else {
                await conn.query(
                    `INSERT INTO quiz_question (id, quiz_id, position, text, type, scale_max, points, partial_scoring) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [qid, req.params.id, i, String(q.text).slice(0, 2000), qType, Number(q.scale_max) || 5, points, partial]
                );
            }
            if (q.type !== 'SCALE') {
                // Colonnes (grilles) OU options (SINGLE/MULTI) : même table quiz_option.
                const opts = Array.isArray(q.options) ? q.options : [];
                for (let j = 0; j < opts.length; j++) {
                    const o = opts[j];
                    if (!o.text || !String(o.text).trim()) continue;
                    // Pour une grille, la justesse est PAR LIGNE (quiz_row.correct), pas sur la colonne.
                    const correctOpt = GRID_TYPES.has(qType) ? 0 : (o.is_correct ? 1 : 0);
                    await conn.query(
                        `INSERT INTO quiz_option (id, question_id, position, text, is_correct) VALUES (?, ?, ?, ?, ?)`,
                        [crypto.randomUUID(), qid, j, String(o.text).slice(0, 500), correctOpt]
                    );
                }
            }
            // Lignes de grille (avec, pour un QCM noté, les positions de colonnes correctes).
            if (GRID_TYPES.has(qType)) {
                const rows = Array.isArray(q.rows) ? q.rows : [];
                for (let j = 0; j < rows.length; j++) {
                    const rw = rows[j];
                    if (!rw.text || !String(rw.text).trim()) continue;
                    const correct = Array.isArray(rw.correct) ? rw.correct.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0) : [];
                    const rp = Number(rw.points);
                    const rowPoints = Number.isFinite(rp) && rp >= 0 ? Math.floor(rp) : 1;
                    const rid = crypto.randomUUID();
                    const cj = correct.length ? JSON.stringify(correct) : null;
                    try {
                        if (hasRowPoints) {
                            await conn.query(`INSERT INTO quiz_row (id, question_id, position, text, correct, points) VALUES (?, ?, ?, ?, ?, ?)`,
                                [rid, qid, j, String(rw.text).slice(0, 500), cj, rowPoints]);
                        } else {
                            await conn.query(`INSERT INTO quiz_row (id, question_id, position, text, correct) VALUES (?, ?, ?, ?, ?)`,
                                [rid, qid, j, String(rw.text).slice(0, 500), cj]);
                        }
                    } catch (e) { if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; }
                }
            }
        }
        logAudit(req, 'quiz.save', 'Quiz', req.params.id);
        res.json({ success: true, message: 'QCM enregistré' });
    } catch (err) {
        console.error('Erreur enregistrement QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/quizzes/:id */
const deleteQuiz = async (req, res) => {
    try {
        await db.promise().query('DELETE FROM quiz WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        res.json({ success: true, message: 'QCM supprimé' });
    } catch (err) {
        console.error('Erreur suppression QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ------------------------------ Passage (stagiaire) ------------------------------ */

// Résout le QCM rattaché à un document (via quiz_id), avec vérif d'accès.
async function quizForDocument(conn, documentId, user) {
    const [[doc]] = await conn.query(
        `SELECT d.id, d.organization_id, d.quiz_id, d.status, l.user_id
         FROM generated_document d LEFT JOIN learner l ON l.id = d.learner_id
         WHERE d.id = ? AND d.organization_id = ?`,
        [documentId, user.organization_id]
    );
    if (!doc) return { error: 404, message: 'Document introuvable' };
    const isOwner = doc.user_id && doc.user_id === user.id;
    if (!isOwner && !STAFF.includes(user.role)) return { error: 403, message: 'Accès refusé' };
    if (!doc.quiz_id) return { error: 404, message: 'Aucun QCM pour ce document' };

    const [[quiz]] = await conn.query('SELECT * FROM quiz WHERE id = ? AND organization_id = ?', [doc.quiz_id, user.organization_id]);
    if (!quiz) return { error: 404, message: 'QCM introuvable' };
    const [[row]] = await conn.query('SELECT enrollment_id FROM document_formation WHERE document_id = ? LIMIT 1', [documentId]);
    return { doc, enrollment_id: row ? row.enrollment_id : null, quiz };
}

/**
 * Construit la « correction » d'un QCM : pour chaque question, les options avec
 * l'indication bonne réponse + la réponse donnée par le stagiaire.
 * questions: [{id,text,type,scale_max}] ; optsByQ: {qid:[{id,text,is_correct}]} ;
 * selByQ: {qid: Set(optionIds) | valeur d'échelle}.
 */
function buildReview(questions, optsByQ, selByQ) {
    return questions.map((q) => {
        if (q.type === 'SCALE') {
            const v = selByQ[q.id];
            return { id: q.id, text: q.text, type: q.type, scale_max: q.scale_max, scaleValue: (v == null || v === '') ? null : Number(v) };
        }
        const opts = optsByQ[q.id] || [];
        const sel = selByQ[q.id] instanceof Set ? selByQ[q.id] : new Set();
        const correctSet = new Set(opts.filter((o) => o.is_correct).map((o) => o.id));
        const options = opts.map((o) => ({ id: o.id, text: o.text, correct: !!o.is_correct, selected: sel.has(o.id) }));
        const allRight = correctSet.size > 0 && correctSet.size === sel.size && [...correctSet].every((id) => sel.has(id));
        return { id: q.id, text: q.text, type: q.type, options, correct: correctSet.size > 0 ? allRight : null };
    });
}

/** GET /api/quizzes/take/:documentId — questions du QCM (sans les bonnes réponses). */
const takeQuiz = async (req, res) => {
    try {
        const conn = db.promise();
        const r = await quizForDocument(conn, req.params.documentId, req.user);
        if (r.error) return res.status(r.error).json({ message: r.message });
        let questions;
        try { [questions] = await conn.query('SELECT id, text, type, scale_max, image FROM quiz_question WHERE quiz_id = ? ORDER BY position', [r.quiz.id]); }
        catch (e) { if (e && e.code === 'ER_BAD_FIELD_ERROR') { [questions] = await conn.query('SELECT id, text, type, scale_max FROM quiz_question WHERE quiz_id = ? ORDER BY position', [r.quiz.id]); } else { throw e; } }
        const qids = questions.map((q) => q.id);
        let options = [];
        if (qids.length) [options] = await conn.query('SELECT id, question_id, text FROM quiz_option WHERE question_id IN (?) ORDER BY position', [qids]);
        const byQ = {};
        for (const o of options) (byQ[o.question_id] = byQ[o.question_id] || []).push({ id: o.id, text: o.text });
        const gridQids = questions.filter((q) => GRID_TYPES.has(q.type)).map((q) => q.id);
        const rowsByQ = await loadGridRows(conn, gridQids, false); // sans les bonnes réponses
        const [[prev]] = await conn.query('SELECT id, score, max_score, DATE_FORMAT(completed_at, "%Y-%m-%d %H:%i") AS completed_at FROM quiz_response WHERE quiz_id = ? AND document_id = ? ORDER BY completed_at DESC LIMIT 1', [r.quiz.id, req.params.documentId]);

        // Déjà répondu + QCM noté : on renvoie la correction (bonnes réponses + réponses données).
        let review = null;
        if (prev && r.quiz.kind === 'GRADED') {
            const [opts2] = qids.length
                ? await conn.query('SELECT id, question_id, text, is_correct FROM quiz_option WHERE question_id IN (?) ORDER BY position', [qids])
                : [[]];
            const optsByQ = {};
            for (const o of opts2) (optsByQ[o.question_id] = optsByQ[o.question_id] || []).push(o);
            const [ans] = await conn.query('SELECT question_id, value FROM quiz_answer WHERE response_id = ?', [prev.id]);
            const selByQ = {};
            const qtype = Object.fromEntries(questions.map((q) => [q.id, q.type]));
            for (const a of ans) {
                if (qtype[a.question_id] === 'SCALE') selByQ[a.question_id] = a.value;
                else selByQ[a.question_id] = new Set(String(a.value || '').split(',').map((s) => s.trim()).filter(Boolean));
            }
            review = buildReview(questions, optsByQ, selByQ);
        }

        res.json({ data: {
            quiz: { id: r.quiz.id, title: r.quiz.title, kind: r.quiz.kind },
            questions: questions.map((q) => ({ id: q.id, text: q.text, type: q.type, scale_max: q.scale_max, image: q.image || null, options: byQ[q.id] || [], rows: rowsByQ[q.id] || [] })),
            done: !!prev, previous: prev || null, review,
        } });
    } catch (err) {
        console.error('Erreur passage QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/quizzes/take/:documentId/submit — enregistre les réponses + note. */
const submitQuiz = async (req, res) => {
    const answers = (req.body && req.body.answers) || {};
    try {
        const conn = db.promise();
        const r = await quizForDocument(conn, req.params.documentId, req.user);
        if (r.error) return res.status(r.error).json({ message: r.message });
        const graded = r.quiz.kind === 'GRADED';

        let questions;
        try { [questions] = await conn.query('SELECT id, text, type, scale_max, points, partial_scoring, image FROM quiz_question WHERE quiz_id = ? ORDER BY position', [r.quiz.id]); }
        catch (e) { if (e && e.code === 'ER_BAD_FIELD_ERROR') { [questions] = await conn.query('SELECT id, text, type, scale_max, points, partial_scoring FROM quiz_question WHERE quiz_id = ? ORDER BY position', [r.quiz.id]); } else { throw e; } }
        const qids = questions.map((q) => q.id);
        let options = [];
        if (qids.length) [options] = await conn.query('SELECT id, question_id, text, is_correct FROM quiz_option WHERE question_id IN (?) ORDER BY position', [qids]);
        const correctByQ = {};
        const optsByQ = {};
        for (const o of options) {
            (optsByQ[o.question_id] = optsByQ[o.question_id] || []).push(o);
            correctByQ[o.question_id] = correctByQ[o.question_id] || new Set();
            if (o.is_correct) correctByQ[o.question_id].add(o.id);
        }
        // Grilles : lignes (avec bonnes réponses) + index de position des colonnes.
        const gridQids = questions.filter((q) => GRID_TYPES.has(q.type)).map((q) => q.id);
        const rowsByQ = await loadGridRows(conn, gridQids, true);
        const optPosByQ = {};
        for (const [qid, opts] of Object.entries(optsByQ)) { const m = {}; opts.forEach((o, idx) => { m[o.id] = idx; }); optPosByQ[qid] = m; }

        let score = 0, maxScore = 0;
        const answerRows = [];
        for (const q of questions) {
            const raw = answers[q.id];
            let value = '';
            if (q.type === 'SCALE') {
                value = raw != null ? String(Number(raw) || '') : '';
            } else if (GRID_TYPES.has(q.type)) {
                // raw = { <rowId>: [<colId>,...] } -> stocké compact { <rowIndex>: [<colIndex>,...] }.
                const gridAns = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
                const rows = rowsByQ[q.id] || [];
                const optPos = optPosByQ[q.id] || {};
                const compact = {};
                rows.forEach((row, ri) => {
                    const selCols = Array.isArray(gridAns[row.id]) ? gridAns[row.id] : (gridAns[row.id] ? [gridAns[row.id]] : []);
                    const selPos = [...new Set(selCols.map((cid) => optPos[cid]).filter((x) => x != null))].sort((a, b) => a - b);
                    if (selPos.length) compact[ri] = selPos;
                });
                value = JSON.stringify(compact).slice(0, 255);
                if (graded && rows.length) {
                    rows.forEach((row, ri) => {
                        const rp = Number(row.points);
                        const per = Number.isFinite(rp) ? rp : 1; // points de la ligne
                        maxScore += per;
                        const correct = new Set((row.correct || []).map(Number));
                        const sel = new Set(compact[ri] || []);
                        const ok = correct.size > 0 && correct.size === sel.size && [...correct].every((c) => sel.has(c));
                        if (ok) score += per;
                    });
                }
            } else {
                const sel = Array.isArray(raw) ? raw : (raw ? [raw] : []);
                value = sel.join(',');
                if (graded) {
                    const correct = correctByQ[q.id] || new Set();
                    if (q.type === 'MULTI' && q.partial_scoring) {
                        // Points par bonne réponse : +points par bonne cochée,
                        // -points par mauvaise cochée ; contribution bornée à 0.
                        maxScore += q.points * correct.size;
                        let qScore = 0;
                        for (const id of new Set(sel)) qScore += correct.has(id) ? q.points : -q.points;
                        score += Math.max(0, qScore);
                    } else {
                        // Tout ou rien : la sélection doit être exactement l'ensemble correct.
                        maxScore += q.points;
                        const selSet = new Set(sel);
                        const ok = correct.size === selSet.size && [...correct].every((id) => selSet.has(id));
                        if (ok && correct.size > 0) score += q.points;
                    }
                }
            }
            answerRows.push({ question_id: q.id, value });
        }

        const responseId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO quiz_response (id, organization_id, quiz_id, learner_id, enrollment_id, document_id, score, max_score)
             VALUES (?, ?, ?, (SELECT learner_id FROM generated_document WHERE id = ?), ?, ?, ?, ?)`,
            [responseId, req.user.organization_id, r.quiz.id, req.params.documentId, r.enrollment_id, req.params.documentId,
             graded ? Math.round(score) : null, graded ? Math.round(maxScore) : null]
        );
        for (const a of answerRows) {
            await conn.query('INSERT INTO quiz_answer (id, response_id, question_id, value) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), responseId, a.question_id, a.value]);
        }
        // Le document est considéré fait (signé) une fois le QCM rempli.
        await conn.query("UPDATE generated_document SET status = 'SIGNE', signed_at = NOW() WHERE id = ?", [req.params.documentId]);
        logAudit(req, 'quiz.submit', 'Quiz', r.quiz.id);

        const percent = graded && maxScore > 0 ? Math.round((score / maxScore) * 100) : null;
        const pass = graded && r.quiz.pass_score != null && percent != null ? percent >= r.quiz.pass_score : null;

        // Correction (bonnes réponses + réponses données) pour les QCM notés.
        let review = null;
        if (graded) {
            const selByQ = {};
            for (const q of questions) {
                const raw = answers[q.id];
                if (q.type === 'SCALE') selByQ[q.id] = raw;
                else selByQ[q.id] = new Set(Array.isArray(raw) ? raw : (raw ? [raw] : []));
            }
            review = buildReview(questions, optsByQ, selByQ);
        }

        res.json({ data: { kind: r.quiz.kind, score: graded ? score : null, max_score: graded ? maxScore : null, percent, pass, review } });
    } catch (err) {
        console.error('Erreur soumission QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/quizzes/:id/send — envoie le QCM aux stagiaires (d'une session, ou de toute la formation). */
const sendQuiz = async (req, res) => {
    try {
        const conn = db.promise();
        const [[quiz]] = await conn.query('SELECT id, program_id, day, title FROM quiz WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!quiz) return res.status(404).json({ message: 'QCM introuvable' });
        if (!quiz.program_id) return res.status(422).json({ error: 'Rattachez d\'abord ce QCM à une formation.' });
        if (quiz.day == null) return res.status(422).json({ error: 'Définissez d\'abord le jour de la formation.' });

        // Seules les sessions dont le jour J est arrivé (et non terminées) sont éligibles.
        let sessions = await eligibleSessionsFor(conn, req.user.organization_id, quiz.program_id, quiz.day);
        const sessionId = req.body && req.body.session_id;
        if (sessionId) sessions = sessions.filter((s) => s.id === sessionId);
        if (!sessions.length) {
            return res.status(422).json({ error: `Aucune session de cette formation n'est au jour ${quiz.day} aujourd'hui.` });
        }
        const [enr] = await conn.query(
            `SELECT e.id AS enrollment_id, e.learner_id FROM enrollment e WHERE e.session_id IN (?)`,
            [sessions.map((s) => s.id)]
        );

        let sent = 0;
        for (const e of enr) {
            const [[ex]] = await conn.query(
                `SELECT gd.id FROM generated_document gd JOIN document_formation df ON df.document_id = gd.id
                 WHERE gd.quiz_id = ? AND df.enrollment_id = ? LIMIT 1`,
                [quiz.id, e.enrollment_id]
            );
            if (ex) continue;
            const docId = crypto.randomUUID();
            await conn.query(
                `INSERT INTO generated_document (id, organization_id, learner_id, type, quiz_id, title, status, sent_at)
                 VALUES (?, ?, ?, 'QCM', ?, ?, 'ENVOYE', NOW())`,
                [docId, req.user.organization_id, e.learner_id, quiz.id, quiz.title]
            );
            await conn.query('INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)', [docId, e.enrollment_id]);
            sent++;
        }
        logAudit(req, 'quiz.send', 'Quiz', quiz.id);
        res.json({ data: { sent, total: enr.length } });
    } catch (err) {
        console.error('Erreur envoi QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/quizzes/:id/send/:enrollmentId — envoie CE QCM à CE dossier précis
 * (action manuelle depuis le parcours du stagiaire). Idempotent : si le QCM a déjà
 * été envoyé à ce dossier, renvoie le document existant.
 */
const sendQuizToEnrollment = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[quiz]] = await conn.query('SELECT id, title FROM quiz WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!quiz) return res.status(404).json({ message: 'QCM introuvable' });
        const [[enr]] = await conn.query('SELECT id, learner_id FROM enrollment WHERE id = ? AND organization_id = ?', [req.params.enrollmentId, orgId]);
        if (!enr) return res.status(404).json({ message: 'Dossier introuvable' });

        // Déjà envoyé à ce dossier ? On ne recrée pas.
        const [[ex]] = await conn.query(
            `SELECT gd.id FROM generated_document gd JOIN document_formation df ON df.document_id = gd.id
             WHERE gd.quiz_id = ? AND df.enrollment_id = ? LIMIT 1`,
            [quiz.id, enr.id]
        );
        if (ex) return res.json({ data: { document_id: ex.id, already: true } });

        const docId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO generated_document (id, organization_id, learner_id, type, quiz_id, title, status, sent_at)
             VALUES (?, ?, ?, 'QCM', ?, ?, 'ENVOYE', NOW())`,
            [docId, orgId, enr.learner_id, quiz.id, quiz.title]
        );
        await conn.query('INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)', [docId, enr.id]);
        logAudit(req, 'quiz.send', 'Quiz', quiz.id);
        res.status(201).json({ data: { document_id: docId } });
    } catch (err) {
        console.error('Erreur envoi QCM (dossier) :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listQuizzes, getQuiz, createQuiz, saveQuiz, deleteQuiz, takeQuiz, submitQuiz, sendQuiz, sendQuizToEnrollment };
