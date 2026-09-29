/**
 * LE COÛT D'UNE FICHE TECHNIQUE — un seul calcul pour l'éditeur, l'impression et la Communauté.
 *
 * Trois écrans chiffraient la même fiche chacun à leur façon, et se contredisaient :
 *
 *  · LA PÂTE COMPTÉE DEUX FOIS. Une réalisation portait une carte « Empâtement » (pâton + prix de
 *    la farine) ET pouvait importer une fiche Pâte comme ingrédient : les deux s'additionnaient.
 *    (Et une pâte coûte partout sa farine, son sel, son huile et sa levure : `computeBuild`.)
 *    Relevé sur une Reine : 2,56 € de matière au lieu de 2,38 €. Désormais la pâte est UNE LIGNE
 *    de la composition : la fiche Pâte importée, ou à défaut une pâte ESTIMÉE (pâton + farine,
 *    l'ancienne carte), qui s'efface d'elle-même dès qu'une fiche Pâte entre dans la réalisation.
 *
 *  · LE COÛT AU KG D'UNE GARNITURE AVAIT DEUX VALEURS. L'éditeur et l'import divisaient par le
 *    RENDEMENT — 1 000 g par défaut, jamais ajusté —, l'impression par le POIDS DES INGRÉDIENTS :
 *    8,40 €/kg d'un côté, 3,28 €/kg de l'autre, pour la même sauce. La règle est maintenant
 *    unique (`prixUnitairePreparation`) : le rendement DÉCLARÉ s'il y en a un, sinon le poids des
 *    ingrédients. Le serveur applique la même (src/api/lib/coutFiche.js), un test les tient
 *    d'accord : c'est son prix qu'une réalisation importe.
 *
 *  · UNE PIÈCE PESAIT UN KILO À L'IMPRESSION : « 1 pâton » s'ajoutait au poids total comme 1 kg.
 *    Une ligne à la pièce ne pèse que si l'on connaît le poids de la pièce (`poidsLigne`).
 *
 * Tout est PUR : pas de React, pas d'appel réseau. Les champs qu'une ligne peut porter :
 *   label, qty, unit ("g" | "piece"), unit_price (€/kg ou €/pièce), product_id,
 *   component_recipe_id, component_kind ("PATE" | "PREPARATION", renvoyé par le serveur),
 *   piece_g (poids d'une pièce : le pâton d'une fiche Pâte).
 */
import { num, computeBuild, DP_DEFAULT } from "./dough.js";

/* Diviseur vers le kilo (1 L compté pour 1 kg, comme partout dans l'outil). */
export const MASS_VOL = { g: 1000, kg: 1, mg: 1e6, l: 1, ml: 1000, cl: 100 };

/* Couleurs des trois lignes qui coûtent le plus (fromage, tomate, bleu) — les autres en gris.
   Elles marquent la barre de chaque ligne ET la répartition du panneau : la même couleur y
   désigne le même ingrédient. */
export const COULEURS_PART = ["#f5b800", "#f0564f", "#3aa0e0"];

/** Coût d'une ligne : quantité en g au prix du kilo, ou nombre de pièces au prix de la pièce. */
export const coutLigne = (t) => (t.unit === "piece"
  ? num(t.qty) * num(t.unit_price)
  : (num(t.qty) / 1000) * num(t.unit_price));

/** Poids d'une ligne en grammes, ou `null` pour une pièce dont on ignore le poids. */
export function poidsLigne(t) {
  if (t.unit !== "piece") return num(t.qty);
  const g = num(t.piece_g);
  return g > 0 ? num(t.qty) * g : null;
}

/** `dough_params` lu tel quel : objet, chaîne JSON (Communauté), ou rien. */
export function lireParams(r) {
  const dp = r?.dough_params;
  if (dp && typeof dp === "object") return dp;
  if (typeof dp === "string") { try { return JSON.parse(dp) || {}; } catch { return {}; } }
  return {};
}

/** La réalisation compte-t-elle déjà sa pâte par une fiche Pâte importée ? */
export const aUneFichePate = (r) => (r?.ingredients || []).some((t) => t.component_recipe_id && t.component_kind === "PATE");

/** L'utilisateur a-t-il retiré la pâte estimée (« pas de pâte à compter ici ») ? */
export const sansPateEstimee = (r) => (r?.pate ?? lireParams(r).pate) === "aucune";

/** La pâte estimée compte-t-elle ? Réalisation, sans fiche Pâte, et pas retirée. */
export const pateEstimeeActive = (r) => r?.kind === "RECETTE" && !aUneFichePate(r) && !sansPateEstimee(r);

/**
 * La pâte ESTIMÉE, sous forme de ligne : un pâton de pâte CLASSIQUE (les réglages par défaut du
 * calculateur : 55 % d'eau, 2 % de sel, 2,5 % d'huile, 0,35 % de levure), chiffré comme tout
 * empâtement — farine, sel, huile et levure (décidé par l'école le 2026-09-29). Son prix au kilo
 * est celui de la PÂTE, pour que « poids × prix » tombe sur le coût du pâton.
 * Elle se comptait à la farine seule (farine ÷ 1,68), quand une fiche Empâtement importée comptait
 * aussi le reste : la même pizza changeait de prix selon d'où venait sa pâte.
 */
export const PATE_ESTIMEE = { ...DP_DEFAULT, mode: "patons" };
export function coutPateEstimee(r) {
  const paton = Math.max(1, num(r.paton_g) || 250);
  return computeBuild({ servings: 1, paton_g: paton, flour_price: r.flour_price, dough_params: PATE_ESTIMEE });
}
export function ligneEstimee(r) {
  const b = coutPateEstimee(r);
  return { estimee: true, label: "Pâte (estimation)", unit: "g", qty: b.patonG, unit_price: b.costPerKg };
}

/**
 * Coût unitaire d'une préparation — LA règle partagée avec le serveur.
 *   · rendement déclaré en masse ou volume → coût ÷ kilos produits (unit "g", prix au kg) ;
 *   · rendement déclaré en pièces          → coût ÷ pièces (unit "piece") ;
 *   · pas de rendement                     → coût ÷ poids des ingrédients ;
 *   · ni rendement ni poids (tout à la pièce) → le lot entier (unit "piece", quantité 1).
 */
export function prixUnitairePreparation(total, poidsG, yieldQty, yieldUnit) {
  const y = num(yieldQty);
  const u = String(yieldUnit || "").toLowerCase();
  if (y > 0 && MASS_VOL[u]) { const kg = y / MASS_VOL[u]; return { unit: "g", unitPrice: total / kg, quantite: kg, source: "rendement" }; }
  if (y > 0) return { unit: "piece", unitPrice: total / y, quantite: y, source: "rendement" };
  if (poidsG > 0) { const kg = poidsG / 1000; return { unit: "g", unitPrice: total / kg, quantite: kg, source: "poids" }; }
  return { unit: "piece", unitPrice: total, quantite: 1, source: "lot" };
}

/**
 * Tout ce qu'affiche une fiche (hors calculateur de pâte) :
 *   lignes    — chaque ligne avec `cout`, `poids`, `part` (0..1) et `couleur` (ou null) ;
 *   total     — coût matière (d'une pizza pour une réalisation, du lot pour une garniture) ;
 *   poids     — grammes connus ; `poidsIncomplet` si une pièce n'a pas de poids ;
 *   coutKg    — coût au kg : du produit fini pour une garniture, de la pizza sinon ;
 *   prep      — pour une garniture : le prix unitaire et sa source (rendement / poids / lot) ;
 *   perte     — pour une garniture à rendement en masse : écart produit fini / ingrédients ;
 *   prix, marge, lot — pour une réalisation : prix conseillé, marge en euros, coût du lot.
 */
export function coutFiche(r) {
  const brutes = [
    ...(pateEstimeeActive(r) ? [ligneEstimee(r)] : []),
    ...(r?.ingredients || []),
  ];
  const lignes = brutes.map((t) => ({ ...t, cout: coutLigne(t), poids: poidsLigne(t) }));
  const total = lignes.reduce((s, l) => s + l.cout, 0);
  const poids = lignes.reduce((s, l) => s + (l.poids || 0), 0);
  const poidsIncomplet = lignes.some((l) => l.poids == null);

  // Parts et couleurs : les trois lignes les plus chères, dans l'ordre du coût.
  const rang = lignes.map((l, i) => i).filter((i) => lignes[i].cout > 0).sort((a, b) => lignes[b].cout - lignes[a].cout);
  rang.forEach((i, k) => { lignes[i].couleur = k < COULEURS_PART.length ? COULEURS_PART[k] : null; });
  lignes.forEach((l) => { l.part = total > 0 ? l.cout / total : 0; if (l.couleur === undefined) l.couleur = null; });

  const out = { lignes, total, poids, poidsIncomplet, coutKg: poids > 0 ? total / (poids / 1000) : 0 };

  if (r?.kind === "PREPARATION") {
    const p = prixUnitairePreparation(total, poids, r.yield_qty, r.yield_unit);
    out.prep = p;
    if (p.unit === "g") out.coutKg = p.unitPrice;
    if (p.source === "rendement" && p.unit === "g" && poids > 0) out.perte = (p.quantite * 1000 - poids) / poids;
  }
  if (r?.kind === "RECETTE") {
    const marge = num(r.margin_pct);
    out.prix = total * (1 + marge / 100);
    out.marge = out.prix - total;
    out.lot = total * Math.max(1, num(r.servings));
  }
  return out;
}

/** Répartition pour le panneau : les lignes colorées, puis « Autres » s'il en reste. */
export function repartition(lignes) {
  const top = lignes.filter((l) => l.couleur).sort((a, b) => b.cout - a.cout);
  const autres = lignes.filter((l) => !l.couleur && l.cout > 0).reduce((s, l) => s + l.part, 0);
  return { top, autres };
}

/** « 37 % », « < 1 % » : une part lisible, jamais « 0 % » pour une ligne qui coûte. */
export function pctPart(part) {
  if (!(part > 0)) return "0\u00a0%";
  const p = Math.round(part * 100);
  return p < 1 ? "<\u00a01\u00a0%" : `${p}\u00a0%`;
}

/**
 * La phrase qui dit où part l'argent, quand elle apprend quelque chose : à partir de trois
 * lignes, si une ligne seule ou les deux premières font au moins la moitié du coût.
 * Les noms restent ceux de la fiche, entre guillemets : pas d'article à deviner.
 */
export function phraseCout(lignes) {
  const payantes = lignes.filter((l) => l.cout > 0).sort((a, b) => b.cout - a.cout);
  if (payantes.length < 3) return null;
  const [a, b] = payantes;
  const nom = (l) => `«\u00a0${String(l.label || "").trim() || "Sans nom"}\u00a0»`;
  if (a.part >= 0.5) return `${nom(a)} fait ${pctPart(a.part)} du coût matière.`;
  if (a.part + b.part >= 0.5) return `${nom(a)} et ${nom(b)} font ${pctPart(a.part + b.part)} du coût matière.`;
  return null;
}
