/**
 * Conversion banque en base -> format attendu par le jeu (Pizza Quest).
 *
 * Le jeu lit historiquement des chapitres codés en dur :
 *   { title, ic, questions: [ { t:'qcm', q, c:[...], a:0, expl, src },
 *                             { t:'vf',  q, a:true, expl, src },
 *                             { t:'assoc', q, pairs:[[g,d],...], expl, src } ] }
 *
 * On RESTITUE EXACTEMENT cette forme plutôt que d'exposer le schéma SQL au composant : tout
 * l'écran de jeu (tirage, mélange des choix, correction, explication) continue de fonctionner
 * sans être réécrit, et le repli sur les banques codées en dur reste possible tant qu'un
 * organisme n'a rien importé.
 *
 * Aucune dépendance à la base : la fonction prend des lignes déjà lues, donc elle se teste.
 */

/**
 * XP effectif d'une question : sa valeur propre si elle en a une, sinon celle de sa
 * difficulté, sinon le socle. Permet de retarifer un palier entier sans rouvrir les
 * questions une à une, tout en autorisant l'exception ponctuelle.
 */
const XP_DEFAUT = 10;
function xpOf(question, difficultyById = new Map()) {
    if (question.xp != null && question.xp !== '') return Number(question.xp);
    const d = difficultyById.get(question.difficulty_id);
    if (d && d.xp != null) return Number(d.xp);
    return XP_DEFAUT;
}

/**
 * Assemble chapitres + questions + options en chapitres jouables.
 * Les trois listes sont des lignes SQL brutes ; l'ordre d'affichage suit `sort_order`.
 * Une question sans option exploitable (QCM vidé de ses choix, ASSOC sans paire) est
 * ÉCARTÉE : mieux vaut un chapitre plus court qu'une question injouable en pleine partie.
 */
function buildChapters(chapters = [], questions = [], options = [], difficulties = []) {
    const diffById = new Map(difficulties.map((d) => [d.id, d]));
    const optsByQ = new Map();
    for (const o of [...options].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))) {
        if (!optsByQ.has(o.question_id)) optsByQ.set(o.question_id, []);
        optsByQ.get(o.question_id).push(o);
    }
    const qByChapter = new Map();
    for (const q of [...questions].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))) {
        if (!qByChapter.has(q.chapter_id)) qByChapter.set(q.chapter_id, []);
        qByChapter.get(q.chapter_id).push(q);
    }

    return [...chapters]
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((ch) => ({
            title: ch.title,
            ic: ch.icon || null,
            questions: (qByChapter.get(ch.id) || []).map((q) => toGameQuestion(q, optsByQ.get(q.id) || [], diffById)).filter(Boolean),
        }))
        .filter((ch) => ch.questions.length > 0); // un chapitre vide n'a rien à jouer
}

/** Une ligne quest_question (+ ses options) -> question du jeu. `null` si inexploitable. */
function toGameQuestion(q, opts, diffById) {
    const base = {
        q: q.text,
        expl: q.explanation || undefined,
        src: q.source || undefined,
        xp: xpOf(q, diffById),
    };
    if (q.type === 'VF') {
        return { ...base, t: 'vf', a: !!q.vf_answer };
    }
    if (q.type === 'ASSOC') {
        const pairs = opts.filter((o) => o.text && o.match_text).map((o) => [o.text, o.match_text]);
        if (pairs.length < 2) return null; // une association d'un seul couple ne teste rien
        return { ...base, t: 'assoc', pairs };
    }
    // QCM : il faut au moins deux choix ET une bonne réponse identifiée.
    const choices = opts.map((o) => o.text);
    const idx = opts.findIndex((o) => o.is_correct);
    if (choices.length < 2 || idx < 0) return null;
    return { ...base, t: 'qcm', c: choices, a: idx };
}

module.exports = { buildChapters, toGameQuestion, xpOf, XP_DEFAUT };
