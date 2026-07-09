// Niveaux de formation et code couleur (carte des stagiaires).
export const LEVELS = [
  { v: "NIV1", label: "Niveau 1", color: "#1e3a8a" },              // bleu foncé
  { v: "NIV1_PRO", label: "Niveau 1 Pro", color: "#dc2626" },      // rouge
  { v: "NIV2", label: "Niveau 2", color: "#eab308" },              // jaune
  { v: "EXPERT", label: "Expert / Spécialisation", color: "#374151" }, // gris noir
  { v: "RS", label: "Certifiante (RS)", color: "#16a34a" },        // vert
];

export const LEVEL_COLOR = Object.fromEntries(LEVELS.map((l) => [l.v, l.color]));
export const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.v, l.label]));
export const UNKNOWN_COLOR = "#9aa0b4";

// SOURCE UNIQUE DE COULEUR — formation / badge / session partagent le même code.
// Un badge (niveau OU code de formation) résout toujours vers la même couleur,
// où qu'il soit affiché (Formations, Sessions, Stagiaires, Suivi, Carte…).
const PALETTE = {
  // Niveaux (badges stagiaire)
  NIV1: "#1e3a8a", NIV1_PRO: "#dc2626", NIV1PRO: "#dc2626", NIV1H: "#1e3a8a",
  NIV2: "#eab308", NIV2C: "#eab308", EXPERT: "#374151",
  RS: "#16a34a", RS7404: "#16a34a",
  // Codes de formation additionnels
  NAPO: "#2f9e6f", TEGLIA: "#b8860b",
};

// Couleur déterministe et stable pour tout code non répertorié.
function hashColor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 52%, 42%)`;
}

/** Couleur unifiée d'un badge (niveau ou code de formation). */
export function badgeColor(v) {
  if (v == null || v === "") return UNKNOWN_COLOR;
  const k = String(v).trim();
  return PALETTE[k] || PALETTE[k.toUpperCase()] || hashColor(k.toUpperCase());
}

// Rétro-compat : les anciens appels passent désormais par la palette unifiée.
export const colorForLevel = (lv) => badgeColor(lv);
