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
export const colorForLevel = (lv) => LEVEL_COLOR[lv] || UNKNOWN_COLOR;
