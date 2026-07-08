const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'];

/* ------------------------------ Administration ------------------------------ */

/** GET /api/quizzes — liste des QCM de l'organisme. */
const listQuizzes = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT q.id, q.title, q.kind, q.slug, q.pass_score, q.active, q.program_id,
                    p.code AS program_code, p.title AS program_title,
                    (SELECT COUNT(*) FROM quiz_question qq WHERE qq.quiz_id = q.id) AS n_questions
             FROM quiz q LEFT JOIN training_program p ON p.id = q.program_id
             WHERE q.organization_id = ? ORDER BY q.created_at DESC`,
            [req.user.organization_id]
        );
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
        const [questions] = await conn.query('SELECT id, position, text, type, scale_max, points FROM quiz_question WHERE quiz_id = ? ORDER BY position', [quiz.id]);
        const qids = questions.map((q) => q.id);
        let options = [];
        if (qids.length) {
            [options] = await conn.query('SELECT id, question_id, position, text, is_correct FROM quiz_option WHERE question_id IN (?) ORDER BY position', [qids]);
        }
        const byQ = {};
        for (const o of options) (byQ[o.question_id] = byQ[o.question_id] || []).push({ id: o.id, text: o.text, is_correct: !!o.is_correct });
        res.json({ data: { ...quiz, questions: questions.map((q) => ({ ...q, options: byQ[q.id] || [] })) } });
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
            `INSERT INTO quiz (id, organization_id, program_id, slug, title, kind, pass_score, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [id, req.user.organization_id, b.program_id || null, b.slug || null, String(b.title).slice(0, 255),
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
            `UPDATE quiz SET title = ?, kind = ?, program_id = ?, slug = ?, pass_score = ?, active = ? WHERE id = ?`,
            [String(b.title || '').slice(0, 255), b.kind === 'SURVEY' ? 'SURVEY' : 'GRADED',
             b.program_id || null, b.slug || null,
             b.pass_score != null && b.pass_score !== '' ? Number(b.pass_score) : null,
             b.active === false ? 0 : 1, req.params.id]
        );
        // Remplace questions + options.
        await conn.query('DELETE FROM quiz_question WHERE quiz_id = ?', [req.params.id]);
        const questions = Array.isArray(b.questions) ? b.questions : [];
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.text || !String(q.text).trim()) continue;
            const qid = crypto.randomUUID();
            await conn.query(
                `INSERT INTO quiz_question (id, quiz_id, position, text, type, scale_max, points) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [qid, req.params.id, i, String(q.text).slice(0, 2000),
                 ['SINGLE', 'MULTI', 'SCALE'].includes(q.type) ? q.type : 'SINGLE',
                 Number(q.scale_max) || 5, Number(q.points) || 1]
            );
            if (q.type !== 'SCALE') {
                const opts = Array.isArray(q.options) ? q.options : [];
                for (let j = 0; j < opts.length; j++) {
                    const o = opts[j];
                    if (!o.text || !String(o.text).trim()) continue;
                    await conn.query(
                        `INSERT INTO quiz_option (id, question_id, position, text, is_correct) VALUES (?, ?, ?, ?, ?)`,
                        [crypto.randomUUID(), qid, j, String(o.text).slice(0, 500), o.is_correct ? 1 : 0]
                    );
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

// Résout le QCM rattaché à un document (formation + slug), avec vérif d'accès.
async function quizForDocument(conn, documentId, user) {
    const [[doc]] = await conn.query(
        `SELECT d.id, d.organization_id, d.template_slug, d.status, l.user_id
         FROM generated_document d LEFT JOIN learner l ON l.id = d.learner_id
         WHERE d.id = ? AND d.organization_id = ?`,
        [documentId, user.organization_id]
    );
    if (!doc) return { error: 404, message: 'Document introuvable' };
    const isOwner = doc.user_id && doc.user_id === user.id;
    if (!isOwner && !STAFF.includes(user.role)) return { error: 403, message: 'Accès refusé' };

    const [[row]] = await conn.query(
        `SELECT e.id AS enrollment_id, s.program_id
         FROM document_formation df JOIN enrollment e ON e.id = df.enrollment_id
         LEFT JOIN training_session s ON s.id = e.session_id
         WHERE df.document_id = ? LIMIT 1`,
        [documentId]
    );
    const [[quiz]] = await conn.query(
        `SELECT * FROM quiz WHERE organization_id = ? AND active = 1
           AND (program_id = ? OR program_id IS NULL) AND slug = ? LIMIT 1`,
        [user.organization_id, row ? row.program_id : null, doc.template_slug]
    );
    if (!quiz) return { error: 404, message: 'Aucun QCM pour ce document' };
    return { doc, enrollment_id: row ? row.enrollment_id : null, quiz };
}

/** GET /api/quizzes/take/:documentId — questions du QCM (sans les bonnes réponses). */
const takeQuiz = async (req, res) => {
    try {
        const conn = db.promise();
        const r = await quizForDocument(conn, req.params.documentId, req.user);
        if (r.error) return res.status(r.error).json({ message: r.message });
        const [questions] = await conn.query('SELECT id, text, type, scale_max FROM quiz_question WHERE quiz_id = ? ORDER BY position', [r.quiz.id]);
        const qids = questions.map((q) => q.id);
        let options = [];
        if (qids.length) [options] = await conn.query('SELECT id, question_id, text FROM quiz_option WHERE question_id IN (?) ORDER BY position', [qids]);
        const byQ = {};
        for (const o of options) (byQ[o.question_id] = byQ[o.question_id] || []).push({ id: o.id, text: o.text });
        const [[prev]] = await conn.query('SELECT score, max_score, DATE_FORMAT(completed_at, "%Y-%m-%d %H:%i") AS completed_at FROM quiz_response WHERE quiz_id = ? AND document_id = ? ORDER BY completed_at DESC LIMIT 1', [r.quiz.id, req.params.documentId]);
        res.json({ data: {
            quiz: { id: r.quiz.id, title: r.quiz.title, kind: r.quiz.kind },
            questions: questions.map((q) => ({ id: q.id, text: q.text, type: q.type, scale_max: q.scale_max, options: byQ[q.id] || [] })),
            done: !!prev, previous: prev || null,
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

        const [questions] = await conn.query('SELECT id, type, points FROM quiz_question WHERE quiz_id = ?', [r.quiz.id]);
        const qids = questions.map((q) => q.id);
        let options = [];
        if (qids.length) [options] = await conn.query('SELECT id, question_id, is_correct FROM quiz_option WHERE question_id IN (?)', [qids]);
        const correctByQ = {};
        for (const o of options) { correctByQ[o.question_id] = correctByQ[o.question_id] || new Set(); if (o.is_correct) correctByQ[o.question_id].add(o.id); }

        let score = 0, maxScore = 0;
        const answerRows = [];
        for (const q of questions) {
            const raw = answers[q.id];
            let value = '';
            if (q.type === 'SCALE') {
                value = raw != null ? String(Number(raw) || '') : '';
            } else {
                const sel = Array.isArray(raw) ? raw : (raw ? [raw] : []);
                value = sel.join(',');
                if (graded) {
                    maxScore += q.points;
                    const correct = correctByQ[q.id] || new Set();
                    const selSet = new Set(sel);
                    const ok = correct.size === selSet.size && [...correct].every((id) => selSet.has(id));
                    if (ok && correct.size > 0) score += q.points;
                }
            }
            answerRows.push({ question_id: q.id, value });
        }

        const responseId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO quiz_response (id, organization_id, quiz_id, learner_id, enrollment_id, document_id, score, max_score)
             VALUES (?, ?, ?, (SELECT learner_id FROM generated_document WHERE id = ?), ?, ?, ?, ?)`,
            [responseId, req.user.organization_id, r.quiz.id, req.params.documentId, r.enrollment_id, req.params.documentId,
             graded ? score : null, graded ? maxScore : null]
        );
        for (const a of answerRows) {
            await conn.query('INSERT INTO quiz_answer (id, response_id, question_id, value) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), responseId, a.question_id, a.value]);
        }
        // Le document est considéré fait (signé) une fois le QCM rempli.
        await conn.query("UPDATE generated_document SET status = 'SIGNE', signed_at = NOW() WHERE id = ?", [req.params.documentId]);
        logAudit(req, 'quiz.submit', 'Quiz', r.quiz.id);

        const percent = graded && maxScore > 0 ? Math.round((score / maxScore) * 100) : null;
        const pass = graded && r.quiz.pass_score != null && percent != null ? percent >= r.quiz.pass_score : null;
        res.json({ data: { kind: r.quiz.kind, score: graded ? score : null, max_score: graded ? maxScore : null, percent, pass } });
    } catch (err) {
        console.error('Erreur soumission QCM :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listQuizzes, getQuiz, createQuiz, saveQuiz, deleteQuiz, takeQuiz, submitQuiz };
