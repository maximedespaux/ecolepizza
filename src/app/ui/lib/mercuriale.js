// Mercuriale — logique partagée. Le catalogue « frais / marché » (RNM) est seedé ici car le
// catalogue Metro (catalog_product) ne contient AUCUN produit frais (fruits/légumes/herbes).
// Prix indicatifs façon RNM (Réseau des Nouvelles des Marchés) — éditables une fois dans la mercuriale.

export const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const MERC_FAMS = ["Légumes", "Fruits", "Herbes", "Fromages"];

// Produits frais / marché (hors catalogue Metro). u = unité de vente (kg/pièce/botte/plateau/litre).
export const FRESH_PRODUCE = [
  // Légumes
  { id: "f-tom-ron", label: "Tomate ronde", family: "Légumes", origin: "France", calibre: "57-67", cond: "colis 6 kg", market: "Perpignan", price: 1.85, unit: "kg" },
  { id: "f-tom-grap", label: "Tomate grappe", family: "Légumes", origin: "Espagne", cond: "colis 5 kg", market: "Perpignan", price: 1.60, unit: "kg" },
  { id: "f-tom-anc", label: "Tomate ancienne", family: "Légumes", origin: "France", cond: "plateau", market: "Cavaillon", price: 3.40, unit: "kg" },
  { id: "f-tom-cer", label: "Tomate cerise", family: "Légumes", origin: "Maroc", cond: "barquette 250 g", market: "Perpignan", price: 4.20, unit: "kg" },
  { id: "f-cou", label: "Courgette", family: "Légumes", origin: "France", calibre: "14-21", cond: "colis 5 kg", market: "Châteaurenard", price: 1.75, unit: "kg" },
  { id: "f-aub", label: "Aubergine", family: "Légumes", origin: "France", cond: "colis 5 kg", market: "Châteaurenard", price: 2.10, unit: "kg" },
  { id: "f-poi-rou", label: "Poivron rouge", family: "Légumes", origin: "Espagne", cond: "colis 5 kg", market: "Perpignan", price: 2.30, unit: "kg" },
  { id: "f-poi-ver", label: "Poivron vert", family: "Légumes", origin: "Espagne", cond: "colis 5 kg", market: "Perpignan", price: 1.90, unit: "kg" },
  { id: "f-poi-jau", label: "Poivron jaune", family: "Légumes", origin: "Pays-Bas", cond: "colis 5 kg", market: "Rungis", price: 2.60, unit: "kg" },
  { id: "f-oig-jau", label: "Oignon jaune", family: "Légumes", origin: "France", calibre: "40-70", cond: "sac 10 kg", market: "Rungis", price: 0.85, unit: "kg" },
  { id: "f-oig-rou", label: "Oignon rouge", family: "Légumes", origin: "Italie", cond: "sac 5 kg", market: "Rungis", price: 1.40, unit: "kg" },
  { id: "f-cham", label: "Champignon de Paris", family: "Légumes", origin: "France", cond: "colis 3 kg", market: "Rungis", price: 3.10, unit: "kg" },
  { id: "f-cham-bru", label: "Champignon de Paris brun", family: "Légumes", origin: "France", cond: "colis 3 kg", market: "Rungis", price: 3.60, unit: "kg" },
  { id: "f-roq", label: "Roquette", family: "Légumes", origin: "Italie", cond: "colis 2 kg", market: "Rungis", price: 6.50, unit: "kg" },
  { id: "f-pdt", label: "Pomme de terre", family: "Légumes", origin: "France", cond: "sac 25 kg", market: "Rungis", price: 0.75, unit: "kg" },
  { id: "f-ail", label: "Ail", family: "Légumes", origin: "France", cond: "filet 5 kg", market: "Rungis", price: 5.80, unit: "kg" },
  { id: "f-epi", label: "Épinard", family: "Légumes", origin: "France", cond: "colis 2 kg", market: "Nantes", price: 4.10, unit: "kg" },
  { id: "f-art", label: "Artichaut violet", family: "Légumes", origin: "France", cond: "colis", market: "Perpignan", price: 3.30, unit: "kg" },
  { id: "f-oli-noi", label: "Olive noire", family: "Légumes", origin: "Grèce", cond: "seau 5 kg", market: "Rungis", price: 6.90, unit: "kg" },
  { id: "f-mais", label: "Maïs doux", family: "Légumes", origin: "France", cond: "boîte 3/1", market: "Rungis", price: 2.20, unit: "kg" },
  // Fruits
  { id: "f-cit", label: "Citron", family: "Fruits", origin: "Espagne", cond: "colis 10 kg", market: "Perpignan", price: 1.95, unit: "kg" },
  { id: "f-fig", label: "Figue", family: "Fruits", origin: "France", cond: "plateau", market: "Perpignan", price: 6.50, unit: "kg" },
  { id: "f-poire", label: "Poire", family: "Fruits", origin: "France", cond: "colis", market: "Rungis", price: 2.10, unit: "kg" },
  { id: "f-ananas", label: "Ananas", family: "Fruits", origin: "Costa Rica", cond: "colis", market: "Rungis", price: 1.80, unit: "pièce" },
  // Herbes
  { id: "f-bas", label: "Basilic frais", family: "Herbes", origin: "France", cond: "botte 100 g", market: "Rungis", price: 1.20, unit: "botte" },
  { id: "f-ori", label: "Origan frais", family: "Herbes", origin: "France", cond: "botte", market: "Rungis", price: 1.60, unit: "botte" },
  { id: "f-per", label: "Persil plat", family: "Herbes", origin: "France", cond: "botte", market: "Rungis", price: 0.90, unit: "botte" },
  { id: "f-thy", label: "Thym", family: "Herbes", origin: "France", cond: "botte", market: "Rungis", price: 1.30, unit: "botte" },
  // Fromages frais (souvent sourcés hors Metro ambiant)
  { id: "f-moz-fdl", label: "Mozzarella fior di latte", family: "Fromages", origin: "Italie", cond: "seau 3 kg", market: "Fournisseur", price: 6.80, unit: "kg" },
  { id: "f-moz-buf", label: "Mozzarella di bufala", family: "Fromages", origin: "Italie", cond: "barquette 125 g", market: "Fournisseur", price: 12.50, unit: "kg" },
  { id: "f-burrata", label: "Burrata", family: "Fromages", origin: "Italie", cond: "barquette", market: "Fournisseur", price: 14.00, unit: "kg" },
  { id: "f-stracc", label: "Stracciatella", family: "Fromages", origin: "Italie", cond: "seau 1 kg", market: "Fournisseur", price: 16.00, unit: "kg" },
  // Les produits « base » (farine, huile, levure, sel) sont des références Metro → ils vivent
  // dans le catalogue Metro, pas dans le frais/marché.
];

export const freshById = (id) => FRESH_PRODUCE.find((p) => p.id === id);
export const FRESH_FAMS = [...new Set(FRESH_PRODUCE.map((p) => p.family))];

// Coût d'un ingrédient de mercuriale sur une recette : au poids (g/ml → prix/unité de 1000)
// sauf produits vendus à la pièce/botte/plateau (qté × prix).
export const PER_WEIGHT = new Set(["kg", "litre", "L"]);
export const mercLineCost = (unit, qty, price) => (PER_WEIGHT.has(String(unit)) ? (num(qty) / 1000) * num(price) : num(qty) * num(price));
export const mercQtyUnit = (unit) => (String(unit) === "kg" ? "g" : (String(unit) === "litre" || String(unit) === "L") ? "ml" : String(unit));

// Nettoie un nom de produit Metro : extrait l'origine en fin de libellé (pays / UE) et la retire
// du libellé affiché. « Poitrine d'agneau sans os sous vide France » → { label:"Poitrine d'agneau
// sans os sous vide", origin:"France" }. Le libellé garde le « comment c'est fait » (sous vide…).
const MERC_ORIGINS = ["France", "Espagne", "Italie", "Pays-Bas", "Allemagne", "Belgique", "Irlande", "Pologne", "Portugal", "Grèce", "Maroc", "Royaume-Uni", "Danemark", "Autriche", "Hongrie", "Roumanie", "Union Européenne", "UE", "CE"];
const ORIGIN_RE = new RegExp(`\\s+(?:origine\\s+)?(${MERC_ORIGINS.join("|")})\\.?$`, "i");
export function parseMetroName(name) {
  const s = String(name || "").trim();
  const m = s.match(ORIGIN_RE);
  if (!m) return { label: s, origin: null };
  let origin = m[1];
  if (/union europ|^ue$/i.test(origin)) origin = "UE";
  else if (/^ce$/i.test(origin)) origin = "CE";
  else if (/royaume/i.test(origin)) origin = "Royaume-Uni";
  return { label: s.slice(0, m.index).trim(), origin };
}
