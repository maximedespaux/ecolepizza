/**
 * Banque de questions de Pizza Quest — côté organisme (phase 2 : contenu).
 *
 * Difficultés, chapitres, questions. Les options (choix d'un QCM, paires d'une association)
 * sont enregistrées AVEC leur question, en remplacement intégral : un QCM se relit d'un bloc,
 * et une modification est presque toujours « voici la nouvelle liste de choix », jamais
 * « supprime le 3e ». Des routes séparées par option auraient multiplié les allers-retours
 * pour un gain nul.
 *
 * Migration 102 non jouée → lectures vides, écritures en 503 explicite.
 */
const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { buildChapters } = require('../lib/questcontent.js');

const isMissingSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');
const MIGRATION_HINT = 'Migration requise : appliquez 102_quest_questions.sql.';
const TYPES = ['QCM', 'VF', 'ASSOC'];
const toSlug = (s) => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Lit chapitres + questions + options d'un organisme (optionnellement d'une formation). */
async function loadBank(conn, orgId, programId = null) {
    const empty = { chapters: [], questions: [], options: [], difficulties: [] };
    try {
        const [difficulties] = await conn.query(
            'SELECT id, name, slug, xp, color, sort_order FROM quest_difficulty WHERE organization_id = ? ORDER BY sort_order, name',
            [orgId]);
        const [chapters] = await conn.query(
            `SELECT id, program_id, title, icon, sort_order, active FROM quest_chapter
             WHERE organization_id = ? ${programId ? 'AND program_id = ?' : ''} ORDER BY sort_order, title`,
            programId ? [orgId, programId] : [orgId]);
        if (!chapters.length) return { ...empty, difficulties };
        const ids = chapters.map((c) => c.id);
        const [questions] = await conn.query(
            `SELECT id, chapter_id, type, text, explanation, source, difficulty_id, xp, vf_answer, sort_order, active
             FROM quest_question WHERE chapter_id IN (?) ORDER BY sort_order`, [ids]);
        const options = questions.length
            ? (await conn.query(
                'SELECT id, question_id, sort_order, text, match_text, is_correct FROM quest_option WHERE question_id IN (?) ORDER BY sort_order',
                [questions.map((q) => q.id)]))[0]
            : [];
        return { chapters, questions, options, difficulties };
    } catch (e) {
        if (isMissingSchema(e)) return empty;
        throw e;
    }
}

/** GET /api/quest/content — banque complète (écran d'administration). */
const getQuestContent = async (req, res) => {
    try {
        const conn = db.promise();
        const bank = await loadBank(conn, req.user.organization_id, req.query.program_id || null);
        res.json({ data: bank });
    } catch (err) {
        console.error('Erreur banque quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ---- Difficultés --------------------------------------------------------------------- */

const createQuestDifficulty = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const name = String(req.body?.name || '').trim();
        if (!name) return res.status(422).json({ message: 'Intitulé requis.' });
        const base = toSlug(name) || 'difficulte';
        let slug = base;
        try {
            for (let i = 2; i <= 50; i++) {
                const [[dup]] = await conn.query(
                    'SELECT 1 AS x FROM quest_difficulty WHERE organization_id = ? AND slug = ? LIMIT 1', [orgId, slug]);
                if (!dup) break;
                slug = `${base}-${i}`;
            }
            const [[mx]] = await conn.query(
                'SELECT COALESCE(MAX(sort_order), 0) AS n FROM quest_difficulty WHERE organization_id = ?', [orgId]);
            const id = crypto.randomUUID();
            await conn.query(
                'INSERT INTO quest_difficulty (id, organization_id, name, slug, xp, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, orgId, name.slice(0, 80), slug, Math.max(0, Number(req.body?.xp) || 0),
                 req.body?.color ? String(req.body.color).slice(0, 20) : null, Number(mx.n) + 10]);
            await logAudit(req, 'CREATE', 'quest_difficulty', id, { name });
            res.status(201).json({ success: true, data: { id } });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
    } catch (err) {
        console.error('Erreur création difficulté :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const updateQuestDifficulty = async (req, res) => {
    try {
        const conn = db.promise();
        const sets = [], vals = [];
        if (req.body?.name !== undefined) {
            const n = String(req.body.name).trim();
            if (!n) return res.status(422).json({ message: 'Intitulé requis.' });
            sets.push('name = ?'); vals.push(n.slice(0, 80));
        }
        if (req.body?.xp !== undefined) { sets.push('xp = ?'); vals.push(Math.max(0, Number(req.body.xp) || 0)); }
        if (req.body?.color !== undefined) { sets.push('color = ?'); vals.push(req.body.color ? String(req.body.color).slice(0, 20) : null); }
        if (req.body?.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(Number(req.body.sort_order) || 0); }
        if (!sets.length) return res.json({ success: true });
        try {
            const [r] = await conn.query(
                `UPDATE quest_difficulty SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
                [...vals, req.params.id, req.user.organization_id]);
            if (!r.affectedRows) return res.status(404).json({ message: 'Difficulté introuvable.' });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        res.json({ success: true, message: 'Difficulté enregistrée.' });
    } catch (err) {
        console.error('Erreur maj difficulté :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** Les questions rattachées retombent sur l'XP par défaut (FK ON DELETE SET NULL). */
const deleteQuestDifficulty = async (req, res) => {
    try {
        const conn = db.promise();
        try {
            const [r] = await conn.query('DELETE FROM quest_difficulty WHERE id = ? AND organization_id = ?',
                [req.params.id, req.user.organization_id]);
            if (!r.affectedRows) return res.status(404).json({ message: 'Difficulté introuvable.' });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        await logAudit(req, 'DELETE', 'quest_difficulty', req.params.id, null);
        res.json({ success: true, message: 'Difficulté supprimée.' });
    } catch (err) {
        console.error('Erreur suppression difficulté :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ---- Chapitres ----------------------------------------------------------------------- */

const createQuestChapter = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const title = String(req.body?.title || '').trim();
        if (!title) return res.status(422).json({ message: 'Titre requis.' });
        const programId = req.body?.program_id || null;
        if (programId) {
            const [[p]] = await conn.query('SELECT id FROM training_program WHERE id = ? AND organization_id = ?', [programId, orgId]);
            if (!p) return res.status(422).json({ message: 'Formation inconnue.' });
        }
        try {
            const [[mx]] = await conn.query(
                'SELECT COALESCE(MAX(sort_order), 0) AS n FROM quest_chapter WHERE organization_id = ?', [orgId]);
            const id = crypto.randomUUID();
            await conn.query(
                'INSERT INTO quest_chapter (id, organization_id, program_id, title, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                [id, orgId, programId, title.slice(0, 160),
                 req.body?.icon ? String(req.body.icon).slice(0, 40) : null, Number(mx.n) + 10]);
            await logAudit(req, 'CREATE', 'quest_chapter', id, { title });
            res.status(201).json({ success: true, data: { id } });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
    } catch (err) {
        console.error('Erreur création chapitre :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const updateQuestChapter = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const sets = [], vals = [];
        if (req.body?.title !== undefined) {
            const t = String(req.body.title).trim();
            if (!t) return res.status(422).json({ message: 'Titre requis.' });
            sets.push('title = ?'); vals.push(t.slice(0, 160));
        }
        if (req.body?.icon !== undefined) { sets.push('icon = ?'); vals.push(req.body.icon ? String(req.body.icon).slice(0, 40) : null); }
        if (req.body?.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(Number(req.body.sort_order) || 0); }
        if (req.body?.active !== undefined) { sets.push('active = ?'); vals.push(req.body.active ? 1 : 0); }
        if (req.body?.program_id !== undefined) {
            const pid = req.body.program_id || null;
            if (pid) {
                const [[p]] = await conn.query('SELECT id FROM training_program WHERE id = ? AND organization_id = ?', [pid, orgId]);
                if (!p) return res.status(422).json({ message: 'Formation inconnue.' });
            }
            sets.push('program_id = ?'); vals.push(pid);
        }
        if (!sets.length) return res.json({ success: true });
        try {
            const [r] = await conn.query(
                `UPDATE quest_chapter SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
                [...vals, req.params.id, orgId]);
            if (!r.affectedRows) return res.status(404).json({ message: 'Chapitre introuvable.' });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        res.json({ success: true, message: 'Chapitre enregistré.' });
    } catch (err) {
        console.error('Erreur maj chapitre :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Position d'un chapitre dans la liste JOUABLE de sa formation, ou -1 s'il n'y figure pas
 * (inactif, ou vidé de ses questions exploitables).
 *
 * C'est cette position — et non l'identifiant du chapitre — que la progression des
 * stagiaires référence (learner_quest_progress.step). D'où ce détour : supprimer un
 * chapitre ne suffit pas, il faut savoir QUEL rang disparaît pour nettoyer et décaler.
 */
async function rangJouable(conn, orgId, programId, chapterId) {
    const bank = await loadBank(conn, orgId, programId);
    const jouables = buildChapters(
        bank.chapters.filter((c) => c.active),
        bank.questions.filter((q) => q.active),
        bank.options, bank.difficulties
    );
    return jouables.findIndex((c) => c.id === chapterId);
}

/**
 * Supprime un chapitre. Questions et options suivent par cascade (clés étrangères de la
 * migration 102) ; l'AVANCEMENT des stagiaires, lui, est dans une autre table et doit être
 * nettoyé ici.
 *
 * Deux gestes, dans cet ordre :
 *   1. effacer la progression du rang supprimé — sans quoi le chapitre resterait « terminé »
 *      pour des stagiaires, et son XP continuerait de compter alors qu'il n'existe plus ;
 *   2. DÉCALER d'un rang les progressions suivantes — la progression étant référencée par
 *      position, tout ce qui suivait glisse d'un cran et pointerait sinon vers le mauvais
 *      chapitre (« La cuisson » héritant des étoiles de « L'empâtement »).
 *
 * L'XP n'est stocké nulle part : il se recalcule à partir de la progression et des questions
 * (cf. lib/questxp). Retirer la progression retire donc l'XP, sans autre écriture.
 */
const deleteQuestChapter = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        let chap, code = null, rang = -1;
        try {
            const [[c]] = await conn.query(
                'SELECT id, program_id, title FROM quest_chapter WHERE id = ? AND organization_id = ?',
                [req.params.id, orgId]);
            if (!c) return res.status(404).json({ message: 'Chapitre introuvable.' });
            chap = c;
            if (chap.program_id) {
                // La progression est classée par CODE de formation (le « monde »).
                const [[p]] = await conn.query('SELECT code FROM training_program WHERE id = ?', [chap.program_id]);
                code = p ? p.code : null;
                rang = await rangJouable(conn, orgId, chap.program_id, chap.id);
            }
            await conn.query('DELETE FROM quest_chapter WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }

        // Chapitre non rattaché, ou qui n'était pas jouable : aucun stagiaire ne peut l'avoir
        // joué, il n'y a donc rien à nettoyer ni à décaler.
        let nettoyes = 0;
        if (code && rang >= 0) {
            try {
                const [del] = await conn.query(
                    'DELETE FROM learner_quest_progress WHERE organization_id = ? AND world = ? AND CAST(step AS UNSIGNED) = ?',
                    [orgId, code, rang]);
                nettoyes = del.affectedRows || 0;
                await conn.query(
                    `UPDATE learner_quest_progress SET step = CAST(CAST(step AS UNSIGNED) - 1 AS CHAR)
                     WHERE organization_id = ? AND world = ? AND CAST(step AS UNSIGNED) > ?`,
                    [orgId, code, rang]
                );
            } catch (e) {
                // Progression absente (migration 070 non jouée) : la suppression reste valide.
                if (!isMissingSchema(e)) throw e;
            }
        }

        await logAudit(req, 'DELETE', 'quest_chapter', req.params.id, { title: chap.title, rang, progressions: nettoyes });
        res.json({
            success: true,
            message: nettoyes
                ? `Chapitre supprimé — avancement effacé pour ${nettoyes} stagiaire(s).`
                : 'Chapitre supprimé.',
        });
    } catch (err) {
        console.error('Erreur suppression chapitre :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ---- Questions ----------------------------------------------------------------------- */

/**
 * Valide le corps d'une question et normalise ses options.
 * Renvoie { error } ou { type, vf, options:[{text, match_text, is_correct}] }.
 * Une question incomplète est refusée À L'ENREGISTREMENT : la laisser passer reviendrait à
 * la découvrir injouable en pleine partie, côté stagiaire.
 */
function parseQuestionBody(body = {}) {
    const type = TYPES.includes(String(body.type || '').toUpperCase()) ? String(body.type).toUpperCase() : null;
    if (!type) return { error: 'Type de question inconnu.' };
    if (!String(body.text || '').trim()) return { error: 'Énoncé requis.' };

    if (type === 'VF') {
        if (body.vf_answer === undefined || body.vf_answer === null) return { error: 'Indiquez si l’affirmation est vraie ou fausse.' };
        return { type, vf: body.vf_answer ? 1 : 0, options: [] };
    }
    if (type === 'ASSOC') {
        const pairs = (Array.isArray(body.pairs) ? body.pairs : [])
            .map((p) => ({ text: String(p?.text ?? p?.[0] ?? '').trim(), match_text: String(p?.match_text ?? p?.[1] ?? '').trim() }))
            .filter((p) => p.text && p.match_text);
        if (pairs.length < 2) return { error: 'Une association demande au moins deux paires complètes.' };
        return { type, vf: null, options: pairs.map((p) => ({ ...p, is_correct: 1 })) };
    }
    const choices = (Array.isArray(body.choices) ? body.choices : [])
        .map((c) => String(c ?? '').trim()).filter(Boolean);
    if (choices.length < 2) return { error: 'Un QCM demande au moins deux choix.' };
    const correct = Number(body.correct_index);
    if (!Number.isInteger(correct) || correct < 0 || correct >= choices.length) {
        return { error: 'Désignez la bonne réponse.' };
    }
    return { type, vf: null, options: choices.map((c, i) => ({ text: c, match_text: null, is_correct: i === correct ? 1 : 0 })) };
}

/** Réécrit intégralement les options d'une question. */
async function replaceOptions(conn, questionId, options) {
    await conn.query('DELETE FROM quest_option WHERE question_id = ?', [questionId]);
    for (const [i, o] of options.entries()) {
        await conn.query(
            'INSERT INTO quest_option (id, question_id, sort_order, text, match_text, is_correct) VALUES (?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), questionId, (i + 1) * 10, String(o.text).slice(0, 500),
             o.match_text ? String(o.match_text).slice(0, 500) : null, o.is_correct ? 1 : 0]);
    }
}

const createQuestQuestion = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const parsed = parseQuestionBody(req.body);
        if (parsed.error) return res.status(422).json({ message: parsed.error });
        try {
            const [[ch]] = await conn.query('SELECT id FROM quest_chapter WHERE id = ? AND organization_id = ?',
                [req.body?.chapter_id, orgId]);
            if (!ch) return res.status(422).json({ message: 'Chapitre inconnu.' });
            const [[mx]] = await conn.query(
                'SELECT COALESCE(MAX(sort_order), 0) AS n FROM quest_question WHERE chapter_id = ?', [ch.id]);
            const id = crypto.randomUUID();
            await conn.query(
                `INSERT INTO quest_question (id, organization_id, chapter_id, type, text, explanation, source, difficulty_id, xp, vf_answer, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, orgId, ch.id, parsed.type, String(req.body.text).trim(),
                 req.body?.explanation ? String(req.body.explanation).trim() : null,
                 req.body?.source ? String(req.body.source).trim().slice(0, 255) : null,
                 req.body?.difficulty_id || null,
                 req.body?.xp === '' || req.body?.xp == null ? null : Math.max(0, Number(req.body.xp) || 0),
                 parsed.vf, Number(mx.n) + 10]);
            await replaceOptions(conn, id, parsed.options);
            await logAudit(req, 'CREATE', 'quest_question', id, { type: parsed.type });
            res.status(201).json({ success: true, data: { id } });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
    } catch (err) {
        console.error('Erreur création question :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const updateQuestQuestion = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const parsed = parseQuestionBody(req.body);
        if (parsed.error) return res.status(422).json({ message: parsed.error });
        try {
            const [r] = await conn.query(
                `UPDATE quest_question SET type = ?, text = ?, explanation = ?, source = ?, difficulty_id = ?, xp = ?, vf_answer = ?, active = ?
                 WHERE id = ? AND organization_id = ?`,
                [parsed.type, String(req.body.text).trim(),
                 req.body?.explanation ? String(req.body.explanation).trim() : null,
                 req.body?.source ? String(req.body.source).trim().slice(0, 255) : null,
                 req.body?.difficulty_id || null,
                 req.body?.xp === '' || req.body?.xp == null ? null : Math.max(0, Number(req.body.xp) || 0),
                 parsed.vf, req.body?.active === undefined ? 1 : (req.body.active ? 1 : 0),
                 req.params.id, orgId]);
            if (!r.affectedRows) return res.status(404).json({ message: 'Question introuvable.' });
            await replaceOptions(conn, req.params.id, parsed.options);
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        await logAudit(req, 'UPDATE', 'quest_question', req.params.id, { type: parsed.type });
        res.json({ success: true, message: 'Question enregistrée.' });
    } catch (err) {
        console.error('Erreur maj question :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const deleteQuestQuestion = async (req, res) => {
    try {
        const conn = db.promise();
        try {
            const [r] = await conn.query('DELETE FROM quest_question WHERE id = ? AND organization_id = ?',
                [req.params.id, req.user.organization_id]);
            if (!r.affectedRows) return res.status(404).json({ message: 'Question introuvable.' });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        await logAudit(req, 'DELETE', 'quest_question', req.params.id, null);
        res.json({ success: true, message: 'Question supprimée.' });
    } catch (err) {
        console.error('Erreur suppression question :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/quest/:programId/chapitres — les chapitres JOUABLES d'une formation,
 * au format attendu par le jeu. Réponse vide = l'organisme n'a rien importé pour cette
 * formation : le front retombe alors sur sa banque codée en dur.
 */
const getPlayableChapters = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const bank = await loadBank(conn, orgId, req.params.programId);
        const chapters = buildChapters(
            bank.chapters.filter((c) => c.active),
            bank.questions.filter((q) => q.active),
            bank.options, bank.difficulties
        );
        res.json({ data: { chapters } });
    } catch (err) {
        console.error('Erreur chapitres jouables :', err);
        res.json({ data: { chapters: [] } }); // jamais bloquer le jeu sur une erreur de contenu
    }
};

module.exports = {
    getQuestContent, getPlayableChapters,
    createQuestDifficulty, updateQuestDifficulty, deleteQuestDifficulty,
    createQuestChapter, updateQuestChapter, deleteQuestChapter,
    createQuestQuestion, updateQuestQuestion, deleteQuestQuestion,
    parseQuestionBody, loadBank,
};
