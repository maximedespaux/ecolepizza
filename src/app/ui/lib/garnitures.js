// Données garnitures & réalisations — bases, produits, produits laitiers, affinités de saveurs
// (« food-pairing » : table d'affinités curée, inspirée du principe de foodpairing.com sans en
// reprendre les données propriétaires), + services / fours / axes d'amélioration.
// Quantités indicatives en g/pizza, prix indicatifs en €/kg (éditables). `fragile` = produit frais
// à éviter en distributeur / à ajouter après cuisson.

export const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const GARN_BASES = [
  { key: "moutarde_miel", label: "Sauce moutarde-miel", emoji: "🍯", qty: 60, price: 7, pairs: ["poulet", "oignon", "emmental"] },
  { key: "satay", label: "Sauce satay", emoji: "🥜", qty: 60, price: 9, pairs: ["poulet", "oignon_rouge", "sesame"] },
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
  /* — ÉLARGISSEMENT DU CATALOGUE (2026-08) —
     Le catalogue s'arrêtait à 25 garnitures, ce qui suffisait pour composer une carte mais pas
     pour couvrir les 14 allergènes : cinq seulement étaient atteignables. Les produits ci-dessous
     ouvrent les crustacés, les mollusques, le sésame, les arachides et les fruits à coque — et
     donnent au passage de quoi varier une carte sans la répéter.
     `lib/allergenes.js` dit ce que chacun porte ; ici on ne décrit que le produit. */
  // Mer — chacun ouvre un allergène que la catégorie « poisson » ne couvre pas.
  { key: "crevettes", label: "Crevettes", cat: "Mer", emoji: "🍤", qty: 60, price: 22, fragile: true, pairs: ["ail", "persil", "creme", "citron"] },
  { key: "moules", label: "Moules", cat: "Mer", emoji: "🦪", qty: 60, price: 14, fragile: true, pairs: ["ail", "persil", "creme"] },
  { key: "calamars", label: "Calamars", cat: "Mer", emoji: "🦑", qty: 60, price: 18, fragile: true, pairs: ["ail", "persil", "piment"] },
  { key: "sardine", label: "Sardines", cat: "Mer", emoji: "🐟", qty: 45, price: 11, pairs: ["tomate", "oignon", "olives"] },
  // Charcuterie et viandes
  { key: "boeuf_hache", label: "Bœuf haché", cat: "Charcuterie", emoji: "🥩", qty: 60, price: 12, pairs: ["oignon", "poivron", "cheddar"] },
  { key: "merguez", label: "Merguez", cat: "Charcuterie", emoji: "🌭", qty: 50, price: 11, pairs: ["poivron", "oignon", "harissa"] },
  { key: "saucisse", label: "Saucisse italienne", cat: "Charcuterie", emoji: "🌭", qty: 50, price: 12, pairs: ["fenouil", "oignon", "mozzarella"] },
  { key: "coppa", label: "Coppa", cat: "Charcuterie", emoji: "🥓", qty: 35, price: 24, pairs: ["roquette", "parmesan", "burrata"] },
  { key: "speck", label: "Speck", cat: "Charcuterie", emoji: "🥓", qty: 35, price: 26, pairs: ["roquette", "champignon", "scamorza"] },
  // La mortadelle porte SOUVENT des pistaches : c'est un piège de service à part entière.
  { key: "mortadelle", label: "Mortadelle", cat: "Charcuterie", emoji: "🥓", qty: 40, price: 14, pairs: ["stracciatella", "pistache", "roquette"] },
  { key: "canard", label: "Magret fumé", cat: "Charcuterie", emoji: "🦆", qty: 40, price: 32, pairs: ["figue", "miel", "chevre"] },
  // Légumes
  { key: "courgette", label: "Courgette", cat: "Légumes", emoji: "🥒", qty: 45, price: 3, pairs: ["chevre", "menthe", "aubergine"] },
  { key: "epinard", label: "Épinards", cat: "Légumes", emoji: "🥬", qty: 40, price: 6, pairs: ["ricotta", "oeuf", "ail"] },
  { key: "artichaut", label: "Artichauts", cat: "Légumes", emoji: "🌿", qty: 45, price: 9, pairs: ["jambon", "olives", "champignon"] },
  { key: "brocoli", label: "Brocoli", cat: "Légumes", emoji: "🥦", qty: 45, price: 5, pairs: ["saucisse", "ail", "piment"] },
  { key: "poireau", label: "Poireau", cat: "Légumes", emoji: "🥬", qty: 45, price: 4, pairs: ["creme", "lardons", "reblochon"] },
  { key: "carotte", label: "Carotte", cat: "Légumes", emoji: "🥕", qty: 40, price: 2, pairs: ["cumin", "chevre", "miel"] },
  { key: "patate_douce", label: "Patate douce", cat: "Légumes", emoji: "🍠", qty: 55, price: 4, pairs: ["chevre", "romarin", "miel"] },
  { key: "betterave", label: "Betterave", cat: "Légumes", emoji: "🫒", qty: 40, price: 4, pairs: ["chevre", "noix", "roquette"] },
  { key: "chou_fleur", label: "Chou-fleur", cat: "Légumes", emoji: "🥦", qty: 45, price: 4, pairs: ["parmesan", "ail", "piment"] },
  { key: "tomate_sechee", label: "Tomates séchées", cat: "Légumes", emoji: "🍅", qty: 30, price: 14, pairs: ["burrata", "basilic", "roquette"] },
  { key: "capres", label: "Câpres", cat: "Légumes", emoji: "🫒", qty: 15, price: 16, pairs: ["anchois", "olives", "origan"] },
  { key: "poivron_grille", label: "Poivrons grillés", cat: "Légumes", emoji: "🫑", qty: 45, price: 7, pairs: ["chorizo", "feta", "oignon_rouge"] },
  // Fruits — la pizza sucrée-salée est une carte à part entière, et ils diversifient les tirages.
  { key: "ananas", label: "Ananas", cat: "Douceurs", emoji: "🍍", qty: 45, price: 4, pairs: ["jambon", "mozzarella"] },
  { key: "pomme", label: "Pomme", cat: "Douceurs", emoji: "🍏", qty: 45, price: 3, pairs: ["chevre", "miel", "canard"] },
  { key: "poire", label: "Poire", cat: "Douceurs", emoji: "🍐", qty: 45, price: 4, pairs: ["gorgonzola", "noix", "miel"] },
  { key: "raisin", label: "Raisin", cat: "Douceurs", emoji: "🍇", qty: 40, price: 5, pairs: ["gorgonzola", "noix"] },
  { key: "abricot_sec", label: "Abricots secs", cat: "Douceurs", emoji: "🍑", qty: 30, price: 12, pairs: ["chevre", "canard", "amande"] },
  // Fruits à coque et graines — ils portent des allergènes majeurs, et n'étaient représentés que
  // par les noix.
  { key: "pignons", label: "Pignons de pin", cat: "Douceurs", emoji: "🌰", qty: 12, price: 48, pairs: ["basilic", "epinard", "parmesan"] },
  { key: "amande", label: "Amandes effilées", cat: "Douceurs", emoji: "🌰", qty: 12, price: 22, pairs: ["chevre", "miel", "abricot_sec"] },
  { key: "pistache", label: "Pistaches", cat: "Douceurs", emoji: "🌰", qty: 12, price: 38, pairs: ["mortadelle", "stracciatella"] },
  { key: "sesame", label: "Graines de sésame", cat: "Aromates", emoji: "🌰", qty: 8, price: 14, pairs: ["poulet", "soja_sauce"] },
  // Aromates
  { key: "persil", label: "Persil", cat: "Aromates", emoji: "🌿", qty: 8, price: 14, fragile: true, pairs: ["ail", "crevettes", "calamars"] },
  { key: "menthe", label: "Menthe", cat: "Aromates", emoji: "🌿", qty: 6, price: 18, fragile: true, pairs: ["courgette", "feta"] },
  { key: "romarin", label: "Romarin", cat: "Aromates", emoji: "🌿", qty: 5, price: 16, pairs: ["pomme_de_terre", "patate_douce"] },
  { key: "thym", label: "Thym", cat: "Aromates", emoji: "🌿", qty: 5, price: 16, pairs: ["champignon", "chevre"] },
  { key: "ail", label: "Ail", cat: "Aromates", emoji: "🧄", qty: 10, price: 6, pairs: ["persil", "crevettes", "epinard"] },
  { key: "piment", label: "Piment", cat: "Aromates", emoji: "🌶️", qty: 5, price: 20, pairs: ["chorizo", "calamars", "brocoli"] },
  { key: "citron", label: "Zeste de citron", cat: "Aromates", emoji: "🍋", qty: 5, price: 8, fragile: true, pairs: ["crevettes", "ricotta"] },
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
  { key: "emmental", label: "Emmental", emoji: "🧀", qty: 80, price: 9 },
  { key: "comte", label: "Comté", emoji: "🧀", qty: 70, price: 15 },
  { key: "raclette", label: "Raclette", emoji: "🧀", qty: 80, price: 12 },
  { key: "brie", label: "Brie", emoji: "🧀", qty: 70, price: 11 },
  { key: "bleu", label: "Bleu d'Auvergne", emoji: "🧀", qty: 55, price: 13 },
  { key: "cheddar", label: "Cheddar", emoji: "🧀", qty: 70, price: 10 },
  { key: "mascarpone", label: "Mascarpone", emoji: "🧀", qty: 50, price: 12, fragile: true },
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

// Rayons du catalogue réel (fragments de taxonomie « category » validés en base).
// Centre de formation : on ne garde que des PRODUITS BRUTS (le pizzaïolo apprend à cuisiner
// les préparations). D'où l'absence des rayons « sauces préparées » et « antipasti » (bruschetta…).
export const RAYONS = [
  { key: "fromage", label: "Fromages", emoji: "🧀", cat: "Fromage" },
  { key: "charcuterie", label: "Charcuterie", emoji: "🥓", cat: "Charcuterie" },
  { key: "viande", label: "Viandes", emoji: "🍗", family: "Boucherie" },
  { key: "tomate", label: "Tomate pelati", emoji: "🍅", cat: "Conserve de tomate" },
  { key: "creme", label: "Crème", emoji: "🥛", cat: "Crème et aide culinaire" },
  { key: "legumes", label: "Légumes", emoji: "🥬", cat: "Conserve de légume" },
  { key: "mer", label: "Mer & poisson", emoji: "🐟", cat: "Conserve de poisson" },
  { key: "huile", label: "Huiles & vinaigres", emoji: "🫙", cat: "Huile et vinaigre" },
  { key: "epices", label: "Épices & herbes", emoji: "🌿", cat: "Epice et herbe" },
];
export const rayonOf = (k) => RAYONS.find((r) => r.key === k);

// Produits déjà préparés à exclure d'un catalogue « produits bruts » (on apprend à les faire).
const PREPARED_RE = /bruschetta|tartinable|caviar d|tapenade|pesto|\bsauce\b|ketchup|mayonnaise|moutarde|prêt[ea]? |prete? |cuisin[ée]|plat cuisin|appareil|soupe|pur[ée]e|mousse |rillette|terrine|antipasti|bocal cuisin|marin[ée] |toute prête/i;
// true si le produit est un ingrédient brut (nom sans marqueur de préparation).
export const isRawProduct = (p) => !PREPARED_RE.test(`${p.name || p.produit || p.label || ""}`);

// Mode de préparation d'une base (surtout tomate & crème) : produit prêt, préparé, ou cuisiné maison.
export const BASE_MODES = {
  tomate: [
    { key: "prete", label: "Prête à l'emploi", desc: "Sauce du commerce", hint: "Sauce tomate prête, versée telle quelle, coût = produit catalogue." },
    { key: "preparee", label: "Préparée", desc: "Pelati assaisonnés", hint: "Tomates concassées + huile, sel, origan, assaisonnées, non cuites." },
    { key: "cuisinee", label: "Cuisinée maison", desc: "Recette mijotée", hint: "Ta sauce cuisinée à partir de produits bruts (atelier produits cuisinés)." },
  ],
  creme: [
    { key: "prete", label: "Crème (produit)", desc: "Crème du commerce", hint: "Crème fraîche épaisse prête, coût = produit catalogue." },
    { key: "perso", label: "Crème personnalisée", desc: "Base crème maison", hint: "Ta base crème (ail, herbes, réduction…), atelier produits cuisinés." },
  ],
};
export const baseModesOf = (baseKey) => BASE_MODES[baseKey] || null;

// Unités au poids/volume (quantité en g/ml → prix par kg/L de 1000). Gère le catalogue Metro
// (Kg/L/Piece) ET la mercuriale (kg/litre/pièce/botte/plateau). Défaut = au poids.
const PER_WEIGHT_U = new Set(["kg", "Kg", "l", "L", "litre"]);
const perWeight = (u) => PER_WEIGHT_U.has(String(u == null ? "kg" : u));
export const lineCost = (i) => (perWeight(i.unit) ? (num(i.qty) / 1000) * num(i.price) : num(i.qty) * num(i.price));
// Libellés d'unité pour l'affichage (prix / quantité).
export const unitShort = (u) => { const s = String(u || "kg"); return (s === "Piece" || s === "pièce") ? "pièce" : (s === "L" || s === "litre" || s === "l") ? "L" : (s === "botte" || s === "plateau") ? s : "kg"; };
export const qtyUnit = (u) => { const s = String(u || "kg"); return perWeight(s) ? ((s === "L" || s === "litre" || s === "l") ? "ml" : "g") : (s === "Piece" ? "pce" : s); };
export const qtyStep = (u) => (perWeight(u) ? 5 : 1);
export const perWeightUnit = perWeight;

// Astuces produit (idées d'amélioration / bonnes pratiques).
export const GARN_TIPS = {
  chorizo: "Un filet de miel adoucit le piquant du chorizo.",
  roquette: "À déposer crue APRÈS cuisson (elle brûle au four).",
  basilic: "À ajouter à la sortie du four pour garder son parfum.",
  burrata: "À poser après cuisson, elle ne doit jamais cuire.",
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
  const total = items.reduce((s, i) => s + lineCost(i), 0);
  return { items, total };
}
export function garnitureItems(garn) {
  if (!garn) return [];
  const out = [];
  const base = GARN_BASES.find((b) => b.key === garn.base);
  if (base && base.key !== "autre") {
    const bp = garn.baseProduct;
    const usingProduct = garn.baseMode === "prete" && bp && (bp.productId || bp.mercId);
    out.push({
      ...base,
      qty: num(garn.baseQty ?? base.qty),
      price: usingProduct ? num(bp.price) : num(garn.basePrice ?? base.price),
      label: usingProduct ? bp.label : (garn.baseLabel || base.label),
      unit: usingProduct ? (bp.unit || "Kg") : "Kg",
      brand: usingProduct ? bp.brand : undefined,
    });
  }
  // Produits : curés (prodOf) OU issus du catalogue réel (l'entrée porte alors label/prix/unité).
  (garn.products || []).forEach((p) => { const m = prodOf(p.key); out.push({ ...m, ...p, qty: num(p.qty ?? m.qty), price: num(p.price ?? m.price), unit: p.unit || "Kg" }); });
  (garn.dairy || []).forEach((d) => { const m = GARN_DAIRY.find((x) => x.key === d.key) || { key: d.key, label: d.label || d.key, emoji: d.emoji || "🧀" }; out.push({ ...m, ...d, qty: num(d.qty ?? m.qty), price: num(d.price ?? m.price), unit: d.unit || "Kg" }); });
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
