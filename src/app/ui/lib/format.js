import { badgeColor } from "./levels.js";

/** Couleur d'une formation à partir de son code — palette UNIFIÉE (cf. levels.js)
 *  pour que formation / badge / session partagent le même code couleur. */
export const colorOf = badgeColor;

/** Initiales d'un nom complet. */
export function initials(first = "", last = "") {
  return `${(first[0] || "")}${(last[0] || "")}`.toUpperCase() || "?";
}

/** Prix en euros formaté FR (2 décimales max — évite les TTC à rallonge type 10,692). */
export function euro(value) {
  return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
}

/**
 * Prix affiché À LA FRANÇAISE SUR UNE CARTE : toujours deux décimales.
 *
 * `euro()` supprime les décimales inutiles, ce qui est le bon choix pour un total de facture mais
 * pas pour une colonne de prix : une carte qui aligne « 5,5 € », « 9 € » et « 12,50 € » se lit
 * comme une erreur de saisie. Ici les chiffres se comparent verticalement, donc ils doivent avoir
 * la même forme.
 */
export function euroFixe(value) {
  return `${Number(value || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Classe de badge pour un score de conformité Qualiopi. */
export function scoreBadge(score) {
  return { VERT: "g", ORANGE: "a", ROUGE: "r" }[score] || "n";
}

/**
 * Date et heure d'une publication, au format français : « 01-08-2026 14:32 ».
 *
 * LE SERVEUR CONTINUE D'ENVOYER DE L'ISO (`2026-08-01 14:32`), et c'est délibéré : le fil TRIE
 * sur cette valeur par comparaison de chaînes (`localeCompare`). En `jj-mm-aaaa`, le tri se
 * ferait sur le JOUR d'abord — le 31 janvier passerait devant le 1er décembre. Le format est
 * donc affaire d'affichage, jamais de transport.
 *
 * Tolérant à l'entrée : ISO avec ou sans heure, avec `T` ou espace. Une valeur vide rend une
 * chaîne vide plutôt qu'un « Invalid Date » — une date manquante ne doit pas crier.
 */
export function dateHeure(v) {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(v));
  if (!m) return String(v);
  const [, a, mo, j, h, mi] = m;
  return `${j}-${mo}-${a}` + (h ? ` ${h}:${mi}` : "");
}
