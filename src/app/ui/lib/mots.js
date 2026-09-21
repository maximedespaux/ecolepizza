/**
 * Compte des mots d'un texte limité, pendant la frappe : la RÉPONSE LIBRE d'un QCM, et la NOTE de
 * la fiche stagiaire (migration 168).
 *
 * LE MÊME QUE CELUI DU SERVEUR (api/lib/reponseLibre.js), qui recompte à l'envoi : s'ils divergeaient,
 * le compteur afficherait « 128 / 128 » sur une réponse refusée. Un test compare les deux.
 * Un mot = une suite de caractères entre deux espaces, avec AU MOINS UNE LETTRE OU UN CHIFFRE
 * (« l'école » et « porte-pelle » : un chacun). La lettre exigée écarte la ponctuation française,
 * précédée d'une espace : sans elle, « le gluten : la pâte » comptait cinq mots.
 */
export const MOTS_MAX_DEFAUT = 128;
/* La note libre de la fiche stagiaire : sa PROPRE limite, demandée à 128 mots le 2026-09-21. Égale
   à celle d'un QCM aujourd'hui, mais elle n'en dépend pas — le serveur a la même (NOTE_MOTS_MAX). */
export const NOTE_STAGIAIRE_MOTS_MAX = 128;

export function compterMots(texte) {
  const t = String(texte == null ? "" : texte).trim();
  return t ? t.split(/\s+/).filter((bloc) => /[\p{L}\p{N}]/u.test(bloc)).length : 0;
}
