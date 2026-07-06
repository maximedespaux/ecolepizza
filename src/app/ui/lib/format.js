/** Couleur d'une formation à partir de son code (pastilles, marqueurs). */
const CODE_COLORS = {
  NIV1: "#dc3e37", NIV1H: "#c62f28", NIV1PRO: "#e8663f",
  NIV2: "#2c3371", NIV2C: "#3a4291",
  EXPERT: "#8a5a2b", NAPO: "#2f9e6f", TEGLIA: "#b8860b", RS7404: "#7b3f9e",
};
export function colorOf(code) {
  return CODE_COLORS[code] || "#5b6079";
}

/** Initiales d'un nom complet. */
export function initials(first = "", last = "") {
  return `${(first[0] || "")}${(last[0] || "")}`.toUpperCase() || "?";
}

/** Prix en euros formaté FR. */
export function euro(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} €`;
}

/** Classe de badge pour un score de conformité Qualiopi. */
export function scoreBadge(score) {
  return { VERT: "g", ORANGE: "a", ROUGE: "r" }[score] || "n";
}
