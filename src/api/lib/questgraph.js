/**
 * Graphe des prérequis de Pizza Quest.
 *
 * Un prérequis dit « pour attaquer B, il faut avoir terminé A ». L'ensemble forme un graphe
 * orienté, et un graphe orienté peut boucler : A exige B qui exige A. Aucune des deux ne
 * devient alors jamais accessible — et la boucle ne se voit pas à l'écran, chaque lien pris
 * isolément semblant raisonnable. On refuse donc l'arête AU MOMENT DE L'AJOUTER.
 *
 * Aucune dépendance à la base : ces fonctions travaillent sur des listes de paires, ce qui
 * les rend testables et réutilisables côté lecture (déverrouillage) comme écriture (garde-fou).
 */

/** Prérequis directs -> Map programId => Set(programIds requis). */
function buildGraph(edges = []) {
    const g = new Map();
    for (const e of edges) {
        const to = e.program_id, from = e.requires_program_id;
        if (!to || !from) continue;
        if (!g.has(to)) g.set(to, new Set());
        g.get(to).add(from);
    }
    return g;
}

/**
 * Tous les prérequis de `programId`, transitivement (A exige B qui exige C → A exige C).
 * Parcours en largeur avec ensemble de visités : une boucle déjà en base ne fait donc pas
 * tourner la fonction à l'infini, elle est simplement traversée une fois.
 */
function allPrerequisites(graph, programId) {
    const out = new Set();
    const queue = [...(graph.get(programId) || [])];
    while (queue.length) {
        const cur = queue.shift();
        if (out.has(cur)) continue;
        out.add(cur);
        for (const next of graph.get(cur) || []) if (!out.has(next)) queue.push(next);
    }
    return out;
}

/**
 * Ajouter « programId exige requiresId » créerait-il un cycle ?
 * Vrai si l'un exige déjà l'autre en remontant la chaîne — ou si les deux sont la même
 * formation (une formation qui s'exige elle-même ne s'ouvre jamais).
 */
function wouldCycle(edges, programId, requiresId) {
    if (!programId || !requiresId) return false;
    if (programId === requiresId) return true;
    // requiresId dépend-il déjà (directement ou non) de programId ? Si oui, ajouter
    // l'arête inverse boucle.
    return allPrerequisites(buildGraph(edges), requiresId).has(programId);
}

/**
 * Formations accessibles pour un stagiaire, d'après ses formations TERMINÉES.
 * `programs` = liste d'ids ; `done` = ids terminés. Une formation est accessible quand tous
 * ses prérequis DIRECTS sont terminés — inutile d'exiger les prérequis transitifs, ils sont
 * déjà couverts par le fait que le prérequis direct ait été terminé.
 * Renvoie Map programId => { unlocked, missing:[ids] }.
 */
function resolveUnlocked(programs = [], edges = [], done = []) {
    const graph = buildGraph(edges);
    const fini = new Set(done);
    const out = new Map();
    for (const id of programs) {
        const missing = [...(graph.get(id) || [])].filter((r) => !fini.has(r));
        out.set(id, { unlocked: missing.length === 0, missing });
    }
    return out;
}

module.exports = { buildGraph, allPrerequisites, wouldCycle, resolveUnlocked };
