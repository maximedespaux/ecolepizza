/**
 * RANGER DES SESSIONS POUR LES CHOISIR — semaine, puis formation.
 *
 * DANS UNE LIB ET NON DANS LE COMPOSANT, pour la même raison que `lib/etapes.js` : une règle de
 * rangement enfermée dans un `.jsx` ne se teste qu'au motif, jamais sur son comportement. Ici
 * elle décide de ce qu'on voit en premier en ouvrant deux écrans — elle mérite d'être éprouvée.
 */

/**
 * Ce que le sélecteur a besoin de savoir d'une session, quel que soit l'écran qui l'envoie.
 *
 * LES DEUX API NE NOMMENT PAS PAREIL — `code`/`program_code`, `inscrits`/`stagiaires`. On
 * normalise ICI plutôt que d'aligner deux contrôleurs pour un composant d'affichage : le jour
 * où un troisième écran arrive avec une troisième orthographe, c'est encore une ligne.
 */
export function normaliserSession(s) {
  return {
    id: s.id,
    code: s.code ?? s.program_code ?? null,
    titre: s.title ?? s.program_title ?? null,
    annee: Number(s.year) || null,
    semaine: Number(s.week) || null,
    inscrits: Number(s.inscrits ?? s.stagiaires ?? 0),
  };
}

/**
 * Regroupe par semaine, dans l'ordre où le serveur les a rendues.
 *
 * L'ORDRE DES SEMAINES VIENT DU SERVEUR, qui trie déjà par date décroissante. Retrier ici sur
 * `annee`/`semaine` casserait sur une session sans semaine (données anciennes) : un `null`
 * comparé à un nombre remonterait en tête, et l'écran s'ouvrirait sur une session orpheline.
 *
 * À L'INTÉRIEUR D'UNE SEMAINE, on trie par CODE de formation : deux sessions parallèles se
 * retrouvent toujours au même endroit d'une semaine à l'autre, ce que l'ordre d'arrivée du
 * serveur — par date, à la minute près — ne garantit pas.
 */
export function grouperParSemaine(sessions) {
  const m = new Map();
  for (const s of (sessions || []).map(normaliserSession)) {
    const cle = `${s.annee}-${String(s.semaine).padStart(2, "0")}`;
    if (!m.has(cle)) m.set(cle, { cle, annee: s.annee, semaine: s.semaine, sessions: [] });
    m.get(cle).sessions.push(s);
  }
  for (const g of m.values()) {
    g.sessions.sort((a, b) => (a.code || "").localeCompare(b.code || "")
      || (a.titre || "").localeCompare(b.titre || ""));
    g.inscrits = g.sessions.reduce((t, x) => t + x.inscrits, 0);
  }
  return [...m.values()];
}
