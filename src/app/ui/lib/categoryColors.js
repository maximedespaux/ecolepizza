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
  // Les montants du dossier, en euros : voisins de l'inscription sur la roue.
  "Prix et financement": 300,
  "Formation": 138,
  "Session": 192,
  "Lieu de formation": 96,
  "Organisme": 2,
  // Ancien groupe, fondu dans « Organisme » le 2026-09-26 : un jeton personnalisé peut encore y être rangé.
  "Émetteur (identité)": 2,
  "Facture": 330,
  "Ligne de facture": 344,
  "Ligne de règlement": 306,
  "Dates et valeurs calculées": 48,
  "Calculé / dates": 48,
  "Personnalisés": 256,
  "Signature": 226,
  "Examen": 14,
  // Les réponses du stagiaire (photos, partenaires) : à mi-chemin des dates (48) et du lieu (96).
  "Autorisations": 72,
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
// Clé → libellés que la palette lui donne (le premier est celui qu'on affiche) : cf. libelleAffiche.
let KEY_LABELS = {};
export function registerTokenGroups(catalog) {
  const m = {};
  const l = {};
  for (const g of catalog || []) {
    for (const t of (g.tokens || [])) {
      if (!t || !t.key) continue;
      // PREMIÈRE occurrence gagnante + `origin` prioritaire : un jeton dupliqué (ex. les
      // coordonnées de l'acheteur regroupées sous « Facture ») garde la couleur de SA catégorie
      // d'origine (Entreprise / Stagiaire), pas celle du groupe où on l'a re-listé.
      if (!(t.key in m)) m[t.key] = t.origin || g.group;
      if (t.label) (l[t.key] || (l[t.key] = [])).push(t.label);
    }
  }
  KEY_GROUP = m;
  KEY_LABELS = l;
}
// Style d'une puce insérée, d'après sa clé. null si la catégorie est inconnue (→ couleur par défaut).
export function chipStyleForKey(key) {
  const g = KEY_GROUP[String(key || "")];
  return g ? categoryChipStyle(g) : null;
}

/* ─── LE LIBELLÉ D'UNE PUCE DÉJÀ POSÉE (2026-09-26) ────────────────────────────────────────────
   Une puce garde le libellé du jour de son insertion (`data-label`). Relevé en production : les
   devis affichaient encore « Formation · Prerequisites », la convention « Entreprise · Representative
   civ » et, pour le prénom du référent, le commentaire de la colonne (« … Cf. migration 174. »),
   longtemps après que la palette les eut traduits ; le « Contrat Hygiène » promettait toujours
   « Date — Mardi (jour 2) ». L'éditeur montre donc le libellé ACTUEL à la place d'un libellé :
     · de REPLI — « Table · colonne », ce que produisait un champ sans traduction ;
     · qui est un COMMENTAIRE de colonne (il cite une migration) ;
     · que le serveur déclare RETIRÉ pour cette clé (`anciens`, cf. ANCIENS_LIBELLES).
   Tout autre libellé figé est un choix — « Qté », « PU HT » dans un tableau d'articles — et reste. */
const LIBELLE_DE_REPLI = /^(Stagiaire|Inscription|Formation|Session|Entreprise|Organisme|Calculé) · /;
const COMMENTAIRE_DE_COLONNE = /\bmigration \d{3}\b/i;
const espaces = (s) => String(s || "").replace(/[\u00a0\u202f]/g, " ").trim();
let ANCIENS = {};
export function registerAnciensLibelles(anciens) {
  const m = {};
  for (const [cle, liste] of Object.entries(anciens || {})) m[cle] = new Set((liste || []).map(espaces));
  ANCIENS = m;
}
export function libelleAffiche(key, fige) {
  const actuels = KEY_LABELS[String(key || "")];
  if (!actuels || !actuels.length) return fige || key || "";
  if (!fige) return actuels[0];
  const f = espaces(fige);
  if (LIBELLE_DE_REPLI.test(f) || COMMENTAIRE_DE_COLONNE.test(f) || (ANCIENS[key] && ANCIENS[key].has(f))) return actuels[0];
  return fige;
}

/* ─── LES JETONS QUI N'EXISTENT PLUS (2026-09-26) ──────────────────────────────────────────────
   Une puce dont la clé n'est ni proposée, ni reconnue, s'imprime VIDE — sans une erreur, puisqu'un
   texte entre accolades peut aussi être du texte. Relevé en production : {custom:Acomtpe}, dont la clé
   avait été corrigée en « Acompte », laissait un blanc à la place de l'acompte dans le devis, la
   convention et le contrat. Ces clés-là, l'éditeur les montre en rouge et les nomme. */
// Remplies seulement DANS un bloc {#Stagiaires} : ni la palette ni le catalogue ne les portent.
const CLES_DE_BLOC = new Set(["N°", "Naissance"]);
export function jetonConnu(key) {
  const k = String(key || "");
  // Registre vide (palette non chargée) : on ne sait rien, on n'accuse rien.
  if (!Object.keys(KEY_GROUP).length) return true;
  return k in KEY_GROUP || k.startsWith("sig:") || CLES_DE_BLOC.has(k)
    || k === "Signature stagiaire" || k === "Signature organisme";
}
/** Les puces d'un HTML d'éditeur dont la clé est inconnue : [{ cle, libelle }], sans doublon. */
export function jetonsInconnus(html) {
  const vus = new Map();
  for (const m of String(html || "").matchAll(/<span\b[^>]*\bdata-token="([^"]+)"[^>]*>/g)) {
    const cle = m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (jetonConnu(cle) || vus.has(cle)) continue;
    const libelle = (/\bdata-label="([^"]*)"/.exec(m[0]) || [])[1] || "";
    vus.set(cle, { cle, libelle: libelle.replace(/&amp;/g, "&").replace(/&#39;/g, "'") });
  }
  return [...vus.values()];
}
