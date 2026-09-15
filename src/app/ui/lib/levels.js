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

// Surcharges définies par l'utilisateur (couleur choisie sur une formation) :
// { CODE|NIVEAU: "#rrggbb" }. Priment sur la palette par défaut.
let OVERRIDES = {};
export function setBadgeColors(map) {
  if (!map) return;
  for (const [k, v] of Object.entries(map)) {
    if (k && v) OVERRIDES[String(k).trim().toUpperCase()] = v;
  }
}

/** Couleur unifiée d'un badge (niveau ou code de formation). */
export function badgeColor(v) {
  if (v == null || v === "") return UNKNOWN_COLOR;
  const k = String(v).trim();
  const K = k.toUpperCase();
  return OVERRIDES[K] || PALETTE[k] || PALETTE[K] || hashColor(K);
}

// Rétro-compat : les anciens appels passent désormais par la palette unifiée.
export const colorForLevel = (lv) => badgeColor(lv);

/**
 * TOUS LES CODES SOUS LESQUELS UN POINT DE LA CARTE PEUT ÊTRE RECONNU.
 *
 * LE DÉFAUT QUE ÇA CORRIGE, relevé en production le 2026-09-15. La carte COLORE un point avec
 * `program_code || level` et l'annonce sous ce nom dans son info-bulle — mais le filtre, lui,
 * ne regardait que `formations`, alimenté par les INSCRIPTIONS. Un stagiaire importé porte sa
 * formation dans son étiquette (`learner.levels`), pas dans une inscription : son point
 * s'affichait donc « NIV1 » et disparaissait dès qu'on filtrait sur NIV1. Le point annonçait
 * une formation sous laquelle il était introuvable.
 *
 * Mesuré sur les 155 points géocodés de l'organisme : `formations` était vide sur les 155.
 * Autrement dit, AUCUN choix de formation ne pouvait rien afficher — le filtre répondait
 * « personne ne suit cette formation » quelle que soit la formation choisie.
 *
 * LES TROIS SOURCES SONT LÉGITIMES et disent la même chose dans des vocabulaires réconciliés
 * côté serveur (`resolveurBadges` traduit une étiquette en code de formation) :
 *   · `formations`    — toutes les formations suivies, via les inscriptions ;
 *   · `program_code`  — la plus récente, celle qui donne sa couleur au point ;
 *   · `level`         — l'étiquette du stagiaire, seule information des dossiers importés.
 *
 * ON FILTRE DONC SUR CE QUE LA CARTE MONTRE. C'est la seule règle qui ne puisse pas mentir.
 */
export function codesDuPoint(p) {
  return [...new Set([...(p?.formations || []), p?.program_code, p?.level].filter(Boolean))];
}
