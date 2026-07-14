// Données garnitures & réalisations — bases, produits, produits laitiers, affinités de saveurs
// (« food-pairing » : table d'affinités curée, inspirée du principe de foodpairing.com sans en
// reprendre les données propriétaires), + services / fours / axes d'amélioration.
// Quantités indicatives en g/pizza, prix indicatifs en €/kg (éditables). `fragile` = produit frais
// à éviter en distributeur / à ajouter après cuisson.

export const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const GARN_BASES = [
  { key: "tomate", label: "Sauce tomate", emoji: "🍅", qty: 80, price: 3, pairs: ["mozzarella", "basilic", "origan", "olives", "anchois", "chorizo"] },
  { key: "creme", label: "Crème", emoji: "🥛", qty: 70, price: 4, pairs: ["lardons", "oignon", "champignon", "chevre", "pomme_de_terre"] },
  { key: "creme_chorizo", label: "Crème chorizo", emoji: "🌶️", qty: 70, price: 6, pairs: ["mozzarella", "poivron", "miel", "chevre", "oignon_rouge"] },
  { key: "ratatouille", label: "Ratatouille", emoji: "🍆", qty: 90, price: 5, pairs: ["chevre", "mozzarella", "basilic", "olives"] },
  { key: "blanche", label: "Base blanche (huile/ail)", emoji: "🧄", qty: 30, price: 4, pairs: ["mozzarella", "roquette", "jambon_cru", "parmesan", "tomate_cerise"] },
  { key: "pesto", label: "Pesto", emoji: "🌿", qty: 40, price: 9, pairs: ["mozzarella", "tomate_cerise", "burrata", "roquette", "noix"] },
  { key: "bbq", label: "Sauce BBQ", emoji: "🍖", qty: 60, price: 5, pairs: ["poulet", "oignon_rouge", "mais", "cheddar"] },
  { key: "autre", label: "Autre / à définir", emoji: "❓", qty: 60, price: 4, pairs: [] },
];

export const GARN_PRODUITS = [
  // Charcuterie
  { key: "chorizo", label: "Chorizo", cat: "Charcuterie", emoji: "🌶️", qty: 40, price: 12, pairs: ["miel", "chevre", "poivron", "mozzarella", "oignon_rouge"] },
  { key: "jambon", label: "Jambon", cat: "Charcuterie", emoji: "🍖", qty: 40, price: 9, pairs: ["champignon", "mozzarella", "olives"] },
  { key: "jambon_cru", label: "Jambon cru", cat: "Charcuterie", emoji: "🥓", qty: 35, price: 18, pairs: ["roquette", "parmesan", "burrata", "figue", "mozzarella"] },
  { key: "lardons", label: "Lardons", cat: "Charcuterie", emoji: "🥓", qty: 40, price: 8, pairs: ["oignon", "creme", "reblochon", "pomme_de_terre"] },
  { key: "pepperoni", label: "Pepperoni", cat: "Charcuterie", emoji: "🍕", qty: 40, price: 11, pairs: ["mozzarella", "oignon"] },
  { key: "poulet", label: "Poulet", cat: "Charcuterie", emoji: "🍗", qty: 50, price: 9, pairs: ["bbq", "poivron", "oignon_rouge", "mais"] },
  // Légumes
  { key: "champignon", label: "Champignons", cat: "Légumes", emoji: "🍄", qty: 40, price: 5, pairs: ["creme", "jambon", "ail"] },
  { key: "poivron", label: "Poivrons", cat: "Légumes", emoji: "🫑", qty: 40, price: 4, pairs: ["chorizo", "oignon", "chevre", "aubergine"] },
  { key: "oignon", label: "Oignon", cat: "Légumes", emoji: "🧅", qty: 25, price: 2, pairs: ["lardons", "creme", "chevre"] },
  { key: "oignon_rouge", label: "Oignon rouge", cat: "Légumes", emoji: "🧅", qty: 25, price: 3, pairs: ["chorizo", "chevre", "miel", "poivron"] },
  { key: "roquette", label: "Roquette", cat: "Légumes", emoji: "🥬", qty: 15, price: 12, fragile: true, pairs: ["jambon_cru", "parmesan", "burrata", "tomate_cerise"] },
  { key: "tomate_cerise", label: "Tomates cerises", cat: "Légumes", emoji: "🍅", qty: 50, price: 6, pairs: ["mozzarella", "basilic", "pesto", "burrata"] },
  { key: "aubergine", label: "Aubergine", cat: "Légumes", emoji: "🍆", qty: 50, price: 4, pairs: ["chevre", "parmesan", "basilic"] },
  { key: "pomme_de_terre", label: "Pomme de terre", cat: "Légumes", emoji: "🥔", qty: 60, price: 2, pairs: ["reblochon", "lardons", "creme"] },
  { key: "olives", label: "Olives", cat: "Légumes", emoji: "🫒", qty: 20, price: 7, pairs: ["tomate", "anchois", "feta", "origan"] },
  { key: "mais", label: "Maïs", cat: "Légumes", emoji: "🌽", qty: 30, price: 3, pairs: ["poulet", "bbq", "thon"] },
  { key: "basilic", label: "Basilic frais", cat: "Aromates", emoji: "🌿", qty: 5, price: 20, fragile: true, pairs: ["mozzarella", "tomate", "burrata"] },
  { key: "origan", label: "Origan", cat: "Aromates", emoji: "🌿", qty: 2, price: 15, pairs: ["tomate", "olives", "feta"] },
  // Mer
  { key: "anchois", label: "Anchois", cat: "Mer", emoji: "🐟", qty: 25, price: 14, pairs: ["tomate", "olives", "ail"] },
  { key: "thon", label: "Thon", cat: "Mer", emoji: "🐟", qty: 50, price: 10, pairs: ["oignon_rouge", "olives", "tomate"] },
  { key: "saumon", label: "Saumon fumé", cat: "Mer", emoji: "🐟", qty: 40, price: 28, fragile: true, pairs: ["creme", "citron", "mozzarella"] },
  // Douceurs
  { key: "miel", label: "Miel", cat: "Douceurs", emoji: "🍯", qty: 15, price: 9, pairs: ["chevre", "chorizo", "noix", "gorgonzola"] },
  { key: "figue", label: "Figue", cat: "Douceurs", emoji: "🫐", qty: 40, price: 12, pairs: ["jambon_cru", "chevre", "miel", "roquette"] },
  { key: "noix", label: "Noix", cat: "Douceurs", emoji: "🌰", qty: 20, price: 16, pairs: ["chevre", "miel", "roquette", "gorgonzola"] },
  { key: "oeuf", label: "Œuf", cat: "Autres", emoji: "🥚", qty: 55, price: 4, fragile: true, pairs: ["lardons", "jambon", "champignon"] },
];

export const GARN_DAIRY = [
  { key: "mozzarella", label: "Mozzarella", emoji: "🧀", qty: 80, price: 8 },
  { key: "mozza_bufala", label: "Mozzarella di bufala", emoji: "🧀", qty: 80, price: 16, fragile: true },
  { key: "stracciatella", label: "Stracciatella", emoji: "🧀", qty: 60, price: 18, fragile: true },
  { key: "burrata", label: "Burrata", emoji: "🧀", qty: 70, price: 20, fragile: true },
  { key: "ricotta", label: "Ricotta", emoji: "🧀", qty: 50, price: 9 },
  { key: "chevre", label: "Chèvre", emoji: "🧀", qty: 50, price: 12 },
  { key: "gorgonzola", label: "Gorgonzola", emoji: "🧀", qty: 50, price: 13 },
  { key: "parmesan", label: "Parmesan", emoji: "🧀", qty: 20, price: 22 },
  { key: "reblochon", label: "Reblochon", emoji: "🧀", qty: 60, price: 14 },
  { key: "feta", label: "Feta", emoji: "🧀", qty: 50, price: 10 },
  { key: "scamorza", label: "Scamorza fumée", emoji: "🧀", qty: 70, price: 13 },
];

const ALL = [...GARN_BASES, ...GARN_PRODUITS, ...GARN_DAIRY];
export const prodOf = (k) => ALL.find((p) => p.key === k) || { key: k, label: k, emoji: "•", qty: 40, price: 6 };

// Astuces produit (idées d'amélioration / bonnes pratiques).
export const GARN_TIPS = {
  chorizo: "Un filet de miel adoucit le piquant du chorizo.",
  roquette: "À déposer crue APRÈS cuisson (elle brûle au four).",
  basilic: "À ajouter à la sortie du four pour garder son parfum.",
  burrata: "À poser après cuisson — elle ne doit jamais cuire.",
  stracciatella: "À poser après cuisson, façon fraîcheur crémeuse.",
  mozza_bufala: "Bien l'égoutter, sinon elle détrempe la pâte.",
  jambon_cru: "À poser après cuisson pour garder son moelleux.",
  saumon: "À ajouter après cuisson, avec un trait de citron.",
  oeuf: "Casser l'œuf à mi-cuisson pour un jaune coulant.",
  champignon: "Faire dégorger/poêler avant, sinon ils rendent de l'eau.",
  miel: "Parfait avec un fromage puissant (chèvre, gorgonzola).",
  figue: "Sublime avec jambon cru + chèvre (sucré/salé).",
};

// « Food-pairing » : à partir de la base + des produits choisis, propose les associations
// complémentaires (score = nombre d'affinités), avec la RAISON (« avec … ») ; exclut ce qui est pris.
export function pairSuggestions(selectedKeys, baseKey) {
  const sel = new Set(selectedKeys);
  const score = {}, reasons = {};
  const add = (pairs, srcLabel) => (pairs || []).forEach((k) => { if (!sel.has(k)) { score[k] = (score[k] || 0) + 1; (reasons[k] = reasons[k] || []).push(srcLabel); } });
  const base = GARN_BASES.find((b) => b.key === baseKey);
  if (base) add(base.pairs, base.label);
  selectedKeys.forEach((k) => add(prodOf(k).pairs, prodOf(k).label));
  return Object.entries(score).sort((a, b) => b[1] - a[1])
    .map(([k]) => ({ ...prodOf(k), score: score[k], matches: [...new Set(reasons[k])] }))
    .filter((p) => p.label && p.cat).slice(0, 6);
}

// Coût matière d'une garniture (base + produits + laitier), €/pizza.
export function garnitureCost(garn) {
  const items = garnitureItems(garn);
  const total = items.reduce((s, i) => s + (num(i.qty) / 1000) * num(i.price), 0);
  return { items, total };
}
export function garnitureItems(garn) {
  if (!garn) return [];
  const out = [];
  const base = GARN_BASES.find((b) => b.key === garn.base);
  if (base && base.key !== "autre") out.push({ ...base, qty: num(garn.baseQty ?? base.qty) });
  // Produits : curés (prodOf) OU issus de la base de données (l'entrée porte alors label/emoji/price).
  (garn.products || []).forEach((p) => { const m = prodOf(p.key); out.push({ ...m, ...p, qty: num(p.qty ?? m.qty), price: num(p.price ?? m.price) }); });
  (garn.dairy || []).forEach((d) => { const m = GARN_DAIRY.find((x) => x.key === d.key) || { key: d.key, label: d.label || d.key, emoji: d.emoji || "🧀" }; out.push({ ...m, ...d, qty: num(d.qty ?? m.qty), price: num(d.price ?? m.price) }); });
  return out;
}

// --- Réalisations ---
export const SERVICES = [
  { key: "sur_place", label: "Sur place", emoji: "🍽️" },
  { key: "emporter", label: "À emporter", emoji: "🥡" },
  { key: "livraison", label: "Livraison", emoji: "🛵" },
  { key: "distributeur", label: "Distributeur à pizza", emoji: "🤖" },
];
export const FOURS = [
  { key: "gaz", label: "Four à gaz", emoji: "🔥" },
  { key: "electrique", label: "Four électrique", emoji: "⚡" },
  { key: "hybride", label: "Four hybride", emoji: "♨️" },
  { key: "convoyeur", label: "Convoyeur", emoji: "🎞️" },
  { key: "bois", label: "Four à bois", emoji: "🪵" },
];
export const COOK_EXTRA = [{ key: "frit", label: "Frit", emoji: "🍳" }, { key: "vapeur", label: "Vapeur", emoji: "💨" }];
export const svcLabel = (k) => (SERVICES.find((s) => s.key === k) || {}).label || "";
export const fourLabel = (k) => (FOURS.find((f) => f.key === k) || {}).label || "";

// Axes d'amélioration d'une réalisation selon le service, le type d'empâtement et la garniture.
export function realisationAxes({ service, doughType, garn }) {
  const axes = [];
  const items = garnitureItems(garn);
  const fragile = items.filter((i) => i.fragile);
  const type = String(doughType || "").toLowerCase();
  const isNapo = /napolit/.test(type);
  const nomad = service === "emporter" || service === "livraison" || service === "distributeur";

  if (isNapo && nomad) axes.push({ tone: "warn", t: "Napolitaine nomade", d: "La napolitaine est parfaite sur place, mais devient élastique/humide à emporter ou en livraison. Privilégie une pâte plus tenue (classique, teglia) pour le nomade." });
  if (isNapo && service === "sur_place") axes.push({ tone: "ok", t: "Bon choix", d: "Napolitaine + service sur place : à déguster immédiatement, texture idéale." });
  if (service === "distributeur" && fragile.length) axes.push({ tone: "bad", t: "Produits fragiles au distributeur", d: `Évite les produits frais/fragiles au distributeur : ${fragile.map((i) => i.label.toLowerCase()).join(", ")}. Ils se dégradent (roquette, œuf, burrata, saumon…).` });
  if (service === "livraison" && fragile.length) axes.push({ tone: "warn", t: "Fraîcheur en livraison", d: `À ajouter à la réception plutôt qu'avant : ${fragile.map((i) => i.label.toLowerCase()).join(", ")}.` });
  if (service === "distributeur") axes.push({ tone: "warn", t: "Réchauffe distributeur", d: "Vise une garniture qui supporte une seconde chauffe : fromages fondants, charcuterie cuite, légumes bien égouttés." });
  if (garn && (garn.products || []).some((p) => prodOf(p.key).key === "champignon")) axes.push({ tone: "warn", t: "Champignons", d: "Fais-les dégorger/poêler avant, sinon ils rendent de l'eau et détrempent la pâte." });
  if (!axes.length) axes.push({ tone: "ok", t: "Rien à signaler", d: "Cette combinaison service / cuisson / garniture ne présente pas de risque particulier." });
  return axes;
}
