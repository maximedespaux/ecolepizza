/**
 * TABULATION DANS UNE ZONE DE TEXTE — la touche Tab insère une tabulation (U+0009) au lieu de
 * changer de champ (demandé le 2026-10-06, pour la rédaction des e-mails du Mailing).
 *
 * On n'intercepte QUE Tab seul : Maj+Tab garde la navigation (on sort du champ vers l'arrière) —
 * sans cette porte de sortie, on enfermerait le clavier dans la zone de texte (piège d'accessibilité).
 *
 * `document.execCommand('insertText')` est DÉPRÉCIÉ mais reste le bon outil ici : il insère à la
 * position du curseur, déclenche l'événement `input` (donc le `onChange` CONTRÔLÉ met l'état React à
 * jour tout seul) et garde l'annulation (Ctrl+Z). S'il échoue, on NE retient PAS Tab — mieux vaut
 * changer de champ que rester prisonnier.
 */

/** Vrai pour la touche Tab SEULE (sans Maj ni Ctrl/Alt/Cmd) — la seule qu'on détourne. */
export function estTabulation(e) {
  return !!e && e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
}

/** Sur un `onKeyDown` de `<textarea>` : insère une tabulation plutôt que de changer de champ. */
export function insererTabulation(e) {
  if (!estTabulation(e)) return false;
  const insere = typeof document !== "undefined" && typeof document.execCommand === "function"
    && document.execCommand("insertText", false, "\t");
  if (insere) e.preventDefault(); // on ne retient Tab que si la tabulation est bien entrée
  return !!insere;
}
