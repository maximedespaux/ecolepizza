/**
 * LA NOTE GLOBALE D'UN STAGIAIRE — additionner ce qui est comparable, et seulement cela.
 *
 * DEUX SOURCES DE POINTS coexistent dans l'application : les QCM notés, et l'évaluation
 * pratique du formateur. Toutes deux rendent des POINTS SUR UN MAXIMUM, donc elles
 * s'additionnent sans rien inventer : le total est vérifiable à la main, ce qu'une moyenne de
 * pourcentages ne serait pas (50 % sur 10 points et 50 % sur 200 ne pèsent pas pareil).
 *
 * CE QUI N'EXISTE PAS NE VAUT PAS ZÉRO. Un stagiaire qui n'a pas encore passé le QCM n'a pas
 * échoué au QCM : sa source est ABSENTE, et le total porte alors sur la seule évaluation.
 * Compter l'absent comme un zéro ferait chuter la note de tous ceux qui n'ont pas fini — c'est
 * la même règle que `totalGrille`, et pour la même raison.
 *
 * LE JURY N'EST PAS UNE SOURCE DE POINTS, et c'est délibéré : il valide des COMPÉTENCES selon
 * une règle (« 5 critères sur 6 dont C2.3 »). Le convertir en points ferait apparaître un
 * nombre que personne n'a calculé et qui ne se retrouve sur aucun document signé. Il est donc
 * rendu à côté du total, jamais dedans.
 */

/** Une source comptable : elle a un maximum strictement positif. */
const compte = (s) => !!s && Number(s.max) > 0;

const entier = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * Fusionne les sources de points d'un dossier.
 * @param sources { [nom]: { points, max } | null }
 * @returns { points, max, percent, sources: [noms comptés], partiel }
 *
 * `partiel` dit qu'au moins une source manque : le total est juste, mais il ne porte pas encore
 * sur tout. Sans lui, « 80 % » se lirait comme un résultat final alors qu'il ne couvre que la
 * moitié de ce qui sera évalué.
 */
function fusionner(sources, attendues) {
    const noms = Object.keys(sources || {});
    const retenues = noms.filter((n) => compte(sources[n]));
    let points = 0;
    let max = 0;
    for (const n of retenues) {
        points += Math.max(0, entier(sources[n].points));
        max += Math.max(0, entier(sources[n].max));
    }
    /* Le total ne dépasse jamais son maximum : une saisie aberrante d'une source ne doit pas
       produire un pourcentage au-dessus de cent, qu'on ne remarquerait qu'après coup. */
    points = Math.min(points, max);
    return {
        points, max,
        percent: max > 0 ? Math.round((points / max) * 100) : null,
        sources: retenues,
        partiel: retenues.length < (Array.isArray(attendues) ? attendues.length : noms.length),
    };
}

/**
 * Les réponses de QCM d'un dossier, ramenées à UNE note.
 *
 * ON NE GARDE QUE LA DERNIÈRE TENTATIVE de chaque QCM. Repasser un QCM crée une SECONDE ligne
 * (`quiz_response` est inséré, jamais remplacé) : additionner les deux compterait le même
 * questionnaire deux fois, gonflerait le maximum, et ferait baisser la note de quelqu'un qui
 * vient justement de se rattraper.
 *
 * LES ENQUÊTES DE SATISFACTION SONT ÉCARTÉES : elles n'ont ni bonne réponse ni maximum. Leur
 * `max_score` est nul — le filtre sur le maximum suffit, mais l'appelant doit aussi ne pas les
 * proposer, sans quoi l'écran annoncerait un QCM « non passé » qui n'est pas une épreuve.
 */
function noteQcm(reponses) {
    const derniere = new Map();
    for (const r of reponses || []) {
        if (!r || !r.quiz_id) continue;
        const vue = derniere.get(r.quiz_id);
        /* `completed_at` peut être identique à la seconde près : à égalité, la dernière lue
           gagne, ce qui suit l'ordre de la requête (du plus récent au plus ancien exclu). */
        if (!vue || String(r.completed_at || '') > String(vue.completed_at || '')) derniere.set(r.quiz_id, r);
    }
    const retenues = [...derniere.values()].filter((r) => Number(r.max_score) > 0);
    const points = retenues.reduce((s, r) => s + Math.max(0, entier(r.score)), 0);
    const max = retenues.reduce((s, r) => s + Math.max(0, entier(r.max_score)), 0);
    return {
        points, max,
        percent: max > 0 ? Math.round((points / max) * 100) : null,
        quiz: retenues.map((r) => ({
            quiz_id: r.quiz_id, title: r.title || '', points: entier(r.score), max: entier(r.max_score),
            percent: Math.round((entier(r.score) / entier(r.max_score)) * 100),
            completed_at: r.completed_at || null,
            /* Le seuil du QCM lui est propre : le total global n'en a pas, chaque épreuve garde
               le sien. Les mêler donnerait un « réussi » global qu'aucun règlement ne définit. */
            reussi: r.pass_score == null ? null
                : Math.round((entier(r.score) / entier(r.max_score)) * 100) >= Number(r.pass_score),
        })),
    };
}

module.exports = { fusionner, noteQcm };
