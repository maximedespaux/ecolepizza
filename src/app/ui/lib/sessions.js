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

/**
 * NUMÉRO DE SEMAINE ISO 8601 — et l'ANNÉE ISO, qui n'est pas toujours celle de la date.
 *
 * POURQUOI CE DÉTOUR PAR LE JEUDI. La semaine ISO appartient à l'année qui contient son JEUDI.
 * Le 1er janvier 2027 est un vendredi : il tombe donc dans la semaine 53 de 2026, pas dans la
 * semaine 1 de 2027. Prendre `getFullYear()` ferait chercher « S53 · 2027 », une semaine qui
 * n'existe pas — et l'écran s'ouvrirait sur la mauvaise, une fois par an, en silence.
 *
 * Les sessions sont enregistrées avec `year` et `week` ISO (`training_session`) : le repère
 * doit se calculer de la même façon, sans quoi la comparaison ne veut rien dire.
 */
export function semaineISO(date = new Date()) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = t.getUTCDay() || 7;            // lundi = 1 … dimanche = 7
  t.setUTCDate(t.getUTCDate() + 4 - jour);    // le jeudi de cette semaine
  const annee = t.getUTCFullYear();           // l'année ISO, celle du jeudi
  const debut = new Date(Date.UTC(annee, 0, 1));
  return { annee, semaine: Math.ceil(((t - debut) / 86400000 + 1) / 7) };
}

/**
 * La semaine sur laquelle OUVRIR : celle d'aujourd'hui, sinon la PROCHAINE qui a des sessions.
 *
 * POURQUOI PAS « LA PLUS RÉCENTE ». Le serveur trie par date décroissante, donc la première
 * était la plus LOINTAINE dans le futur : l'écran s'ouvrait sur une session de novembre un
 * 16 septembre. On vient noter ce qu'on enseigne, pas ce qu'on enseignera dans deux mois.
 *
 * ET SI TOUT EST PASSÉ — fin d'année scolaire, reprise en septembre — on ouvre sur la dernière
 * semaine écoulée : mieux vaut le travail qu'on vient de finir qu'une page vide.
 */
export function semaineParDefaut(groupes, aujourdhui = new Date()) {
  if (!groupes || !groupes.length) return null;
  const { annee, semaine } = semaineISO(aujourdhui);
  const rang = (g) => (Number(g.annee) || 0) * 100 + (Number(g.semaine) || 0);
  const maintenant = annee * 100 + semaine;
  const datees = groupes.filter((g) => g.annee && g.semaine);
  if (!datees.length) return groupes[0].cle;
  const exacte = datees.find((g) => rang(g) === maintenant);
  if (exacte) return exacte.cle;
  /* La PROCHAINE : la plus petite au-dessus d'aujourd'hui. `groupes` est trié par date
     décroissante, donc « la prochaine » est la DERNIÈRE des futures, pas la première. */
  const futures = datees.filter((g) => rang(g) > maintenant);
  if (futures.length) return futures.reduce((min, g) => (rang(g) < rang(min) ? g : min)).cle;
  // Tout est passé : la plus récente des écoulées.
  return datees.reduce((max, g) => (rang(g) > rang(max) ? g : max)).cle;
}
