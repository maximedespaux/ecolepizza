// Couleur par CATÉGORIE de jeton / champ, partagée par la palette de l'éditeur et par
// « Champs documents ». Même nom de groupe ⇒ même teinte des deux côtés, pour qu'on repère
// d'un coup d'œil à quelle famille appartient un jeton (Stagiaire, Entreprise, Facture…).
//
// On travaille en TEINTE (hue) HSL : les couleurs restent lisibles en thème clair ET sombre
// (le fond des puces est une TRANSPARENCE teintée via color-mix, qui s'adapte au fond réel).

// Teintes choisies pour les groupes courants (réparties sur la roue, distinctes deux à deux).
const CURATED = {
  "Stagiaire": 212,
  "Entreprise": 28,
  "Groupe entreprise": 42,
  "Financeur (OPCO)": 168,
  "Inscription": 282,
  "Formation": 138,
  "Session": 192,
  "Lieu de formation": 96,
  "Organisme": 2,
  "Émetteur (identité)": 2,
  "Facture": 330,
  "Ligne de facture": 344,
  "Ligne de règlement": 306,
  "Dates et valeurs calculées": 48,
  "Calculé / dates": 48,
  "Personnalisés": 256,
  "Signature": 226,
  "Examen": 14,
};

// Teinte d'une catégorie : curatée si connue, sinon dérivée du nom (déterministe) — un groupe
// personnalisé garde ainsi toujours la même couleur, sans qu'on ait à la déclarer.
export function categoryHue(name) {
  const n = String(name || "").trim();
  if (n in CURATED) return CURATED[n];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return h % 360;
}

// Style d'une PUCE (chip / jeton) de cette catégorie : texte + bord teintés, fond en
// transparence teintée (s'adapte au thème). À étaler sur le style inline de l'élément.
export function categoryChipStyle(name) {
  const h = categoryHue(name);
  return {
    color: `hsl(${h} 60% 46%)`,
    borderColor: `hsl(${h} 55% 62%)`,
    background: `color-mix(in srgb, hsl(${h} 72% 50%) 13%, transparent)`,
  };
}

// Couleur d'ACCENT (dot / filet) pour l'en-tête d'un groupe.
export function categoryAccent(name) {
  return `hsl(${categoryHue(name)} 62% 50%)`;
}

// Registre CLÉ de jeton → groupe, rempli par l'éditeur au chargement du catalogue. Sert à colorer
// AUSSI les puces DÉJÀ INSÉRÉES dans le document selon leur catégorie (la puce ne connaît que sa
// clé). Rempli avant l'insertion du contenu, donc disponible au rendu des puces.
let KEY_GROUP = {};
export function registerTokenGroups(catalog) {
  const m = {};
  for (const g of catalog || []) for (const t of (g.tokens || [])) if (t && t.key) m[t.key] = g.group;
  KEY_GROUP = m;
}
// Style d'une puce insérée, d'après sa clé. null si la catégorie est inconnue (→ couleur par défaut).
export function chipStyleForKey(key) {
  const g = KEY_GROUP[String(key || "")];
  return g ? categoryChipStyle(g) : null;
}
