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

/** Classe de badge pour un score de conformité Qualiopi. */
export function scoreBadge(score) {
  return { VERT: "g", ORANGE: "a", ROUGE: "r" }[score] || "n";
}
