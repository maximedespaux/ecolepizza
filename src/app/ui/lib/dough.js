// Logique de calcul d'empâtement — source unique partagée par la « Fiche technique » (FicheRecette)
// et le futur assistant pas-à-pas (PateWizard). Valeurs issues du Manuel École Pizza + cahiers des
// charges napolitains (STG / AVPN). Purement des données/fonctions, aucun React.

export const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Température de farine, avec le défaut de 17 °C du manuel.
 *
 * Ni `num(v) || 17` ni `num(v) ?? 17` ne conviennent : le premier écrase un **0 °C saisi
 * exprès** (farine sortie du froid — une valeur parfaitement légale, que le champ accepte),
 * le second ne se déclenche jamais puisque `num()` renvoie 0 et jamais `null`. Il faut donc
 * regarder la valeur AVANT conversion : c'est le seul endroit où « vide » et « zéro » se
 * distinguent encore.
 */
export const tempFarine = (v) => (v === null || v === undefined || v === "" ? 17 : num(v));

// Indice de force de la farine (W) — Manuel p.17 (usages) & p.32 (hydratation min + eau/kg).
// `hydra` = hydratation min. de coulage ; `maxTotal` = hydratation TOTALE max (coulage + bassinage)
// atteignable pour cette force — progressive : un W faible ne bassine presque pas, un W fort monte
// jusqu'à 68 % (règle Jean-Jacques Despaux).
export const W_BRACKETS = [
  { w: 225, label: "W 200–250", use: "Empâtement direct, levage court", hydra: 54, maxTotal: 60 },
  { w: 280, label: "W 250–310", use: "Pizza napolitaine", hydra: 55, maxTotal: 62 },
  { w: 360, label: "W 330–390", use: "Directs longs & indirects", hydra: 57, maxTotal: 65 },
  { w: 415, label: "W 400–430", use: "Manitoba — renfort de farine", hydra: 60, maxTotal: 68 },
];
export const wBracket = (w) => W_BRACKETS.find((b) => b.w === w) || W_BRACKETS[0];
// Plafond d'hydratation TOTALE : dépend du W ; Teglia/Pala montent jusqu'à 80 % quelle que soit la force.
export const maxTotalFor = (preset, wObj) => (preset.needs === "spe" ? (preset.hydraMax || 80) : (wObj.maxTotal || 68));

// --- Sélection FINE du W (200–450) : interpolation linéaire des valeurs du manuel (p.32) ---
// pour que l'hydratation min. de coulage et le plafond total collent au W exact choisi.
export const W_MIN = 200, W_MAX = 450;
const W_HYDRA_ANCHORS = [[200, 54], [250, 55], [300, 56], [330, 57], [390, 59], [420, 60], [450, 61]];
const W_MAXTOTAL_ANCHORS = [[200, 60], [250, 60], [310, 62], [390, 65], [430, 68], [450, 68]];
const interpW = (anchors, w) => {
  if (w <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (w >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [w0, v0] = anchors[i], [w1, v1] = anchors[i + 1];
    if (w >= w0 && w <= w1) return v0 + (v1 - v0) * (w - w0) / (w1 - w0);
  }
  return last[1];
};
export const hydraMinForW = (w) => Math.round(interpW(W_HYDRA_ANCHORS, num(w) || W_MIN));
export const maxTotalForW = (w) => Math.round(interpW(W_MAXTOTAL_ANCHORS, num(w) || W_MIN));
export const wUsage = (w) => (num(w) < 250 ? "Directs courts, levage rapide" : num(w) < 320 ? "Napolitaine & directs moyens" : num(w) < 400 ? "Directs longs & indirects (biga/poolish)" : "Manitoba — renfort, très longue fermentation");

// Typologies. `hydraMax` = plafond d'hydratation ; `wMin`/`wMax` = plage de force W recommandée ;
// `needs` = prérequis de formation (niv2 / napo / spe) pour débloquer la typologie.
export const PRESETS = [
  { nom: "Classique", ic: "pizza", methods: ["Direct", "Biga", "Poolish"], w: 225, wMin: 200, hydra: 55, hydraMax: 68, sel: 2.0, huile: 2.5, levure: 0.5, paton: 250, desc: "Cornicione léger. Direct au Niveau I, indirect au Niveau II." },
  { nom: "Contemporaine", ic: "pizza", methods: ["Biga", "Poolish"], needs: "niv2", w: 360, wMin: 320, hydra: 60, hydraMax: 68, sel: 2.8, huile: 0, levure: 0.3, paton: 270, desc: "Cornicione haut et dense. Indirect, farine forte." },
  { nom: "Napolitaine", ic: "flame", methods: ["Direct"], needs: "napo", w: 280, wMin: 280, wMax: 310, hydra: 57, hydraMax: 68, sel: 2.8, huile: 0, levure: 0.2, paton: 250, desc: "Direct, W 280–310, très haute température." },
  { nom: "Teglia", ic: "package", methods: ["Direct", "Biga", "Poolish"], needs: "spe", w: 360, wMin: 280, hydra: 75, hydraMax: 80, sel: 2.5, huile: 2, levure: 0.3, paton: 300, desc: "Plaque al taglio, très haute hydratation (jusqu'à 80 %)." },
  { nom: "Pala", ic: "package", methods: ["Direct", "Biga", "Poolish"], needs: "spe", w: 360, wMin: 280, hydra: 75, hydraMax: 80, sel: 2.5, huile: 1.5, levure: 0.3, paton: 300, desc: "Sur pelle, cuite sur pierre, haute hydratation." },
];
// Prérequis (formation à suivre) pour débloquer une typologie ou les empâtements indirects.
export const NEEDS_LABEL = { niv2: "le Niveau II", napo: "la spécialisation Napolitaine", spe: "la spécialisation In Teglia & Pala" };
export const INDIRECT = ["Biga", "Poolish"]; // indirects → prérequis Niveau II + farine ≥ W320
export const INDIRECT_WMIN = 320;

// Cahiers des charges napolitains — sous-sélecteur de la typologie « Napolitaine ».
// STG = Règlement UE 97/2010 ; AVPN = disciplinare 2024 ; École = règles Jean-Jacques Despaux.
export const NAPO_SPECS = [
  { key: "stg", label: "STG", w: 280, wMin: 220, wMax: 380, hydra: 56, hydraMin: 55, hydraMax: 62, sel: 2.9, huile: false,
    levure: 0.17, levureMin: 0.17, levureMax: 0.17, levureNote: "Fraîche 3 g / L d'eau · sèche = ⅓ de la fraîche.",
    paton: 220, patonMin: 180, patonMax: 250,
    ambT: 25, ambH: 7, doughTemp: 25, ferment: "Pointage 2 h + apprêt 4-6 h, à température ambiante (~25 °C)", cuisson: "Four à bois — sole 485 °C, voûte 430 °C · 60-90 s", src: "Règlement UE 97/2010" },
  { key: "avpn", label: "AVPN", w: 280, wMin: 250, wMax: 320, hydra: 58, hydraMin: 55, hydraMax: 62, sel: 2.9, huile: false,
    levure: 0.1, levureMin: 0.01, levureMax: 0.18, levureNote: "Fraîche 0,1-3 g / L d'eau (selon T°, humidité, temps) · sèche = ⅓ de la fraîche · levain < 10 % de la farine.",
    paton: 250, patonMin: 200, patonMax: 280,
    ctrlT: 19, ctrlH: 8, doughTemp: 22, ferment: "2 étapes en chambre contrôlée 18-20 °C, 60-70 % HR", cuisson: "Four à bois — sole 380-430 °C, voûte 485 °C · 60-90 s", src: "Disciplinare AVPN 2024" },
  { key: "ecole", label: "École (libre)", w: 280, wMin: 280, wMax: 310, hydra: 60, hydraMin: 55, hydraMax: 68, sel: 2.8, levure: null, paton: 250,
    ferment: "", cuisson: "", src: "Règles École Pizza" },
];
export const napoSpecOf = (k) => NAPO_SPECS.find((s) => s.key === k) || NAPO_SPECS[0];

export const DP_DEFAULT = { preset: "Classique", method: "Direct", autolyse: false, w: 225, hydra: 55, bassinage: 0, sel: 2.0, huile: 2.5, levure: 0.35, yeastType: "fraiche", localTemp: 20, levStorage: "ambiante", flourTemp: 17, mode: "patons", flourKg: 10, prefermentH: "", fermentH: "", ambH: "", ambT: "", ctrlH: "", ctrlT: "", napoSpec: "" };
export const gfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(2) + " kg" : Math.round(n) + " g");

// Adjonctions (manuel p.30) — % sur le poids de la farine, ajoutées pendant le pétrissage.
// `water` = facteur d'eau de bassinage à ajouter (les graines torréfiées absorbent ≈ leur poids).
// `phase` = moment d'incorporation au pétrissage (manuel p.30) : flour (avec la farine) /
// knead (en cours) / beforeSalt (avant le sel) / afterOil (après l'huile).
export const ADJONCTIONS = [
  { key: "graines", label: "Graines torréfiées", min: 3, max: 6, def: 4, when: "Avant le sel (10 mn)", phase: "beforeSalt", water: 1, price: 12 },
  { key: "pf", label: "Pâte fermentée", min: 10, max: 30, def: 20, when: "À la 8ᵉ minute", phase: "knead", water: 0, price: 1.5 },
  { key: "naturkraft", label: "Naturkraft", min: 2, max: 6, def: 4, when: "Avec la farine", phase: "flour", water: 0, price: 16 },
  { key: "son", label: "Son", min: 1, max: 3, def: 1, when: "Après l'huile (12 mn)", phase: "afterOil", water: 0, price: 3 },
  { key: "charbon", label: "Charbon végétal", min: 1, max: 2, def: 1, when: "Avec la farine", phase: "flour", water: 0, price: 22 },
];
export const adjOf = (k) => ADJONCTIONS.find((a) => a.key === k) || {};
export const adjonctionsPct = (dp) => (dp.adjonctions || []).reduce((s, a) => s + num(a.pct), 0);
// Eau de compensation (manuel p.30/32) — les farines de substitution et les graines torréfiées
// assèchent la pâte : on ajoute de l'eau de bassinage pour compenser (en % de la farine).
export const substWaterG = (dp) => subsOf(dp).reduce((s, x) => s + subOf(x.key).bass10 * (num(x.pct) / 10), 0); // g/kg de farine
export const adjWaterPct = (dp) => (dp.adjonctions || []).reduce((s, a) => s + num(a.pct) * (adjOf(a.key).water || 0), 0);
// Absorption de la farine de base (blé) selon son Type/Tipo, au prorata de sa part.
export const tipoWaterPct = (dp) => {
  const blePct = Math.max(0, 100 - Math.min(60, subsOf(dp).reduce((s, x) => s + num(x.pct), 0)));
  return (tipoOf(dp.tipo)?.water || 0) * (blePct / 100);
};
export const compWaterPct = (dp) => +(substWaterG(dp) / 10 + adjWaterPct(dp) + tipoWaterPct(dp)).toFixed(2);
// Type / Tipo de la farine de blé — équivalence France (T…) ↔ Italie (00, 0, 1, 2, intégrale),
// classée par taux de cendres (extraction). France = 5 moutures ; Italie = 4 tipi + intégrale.
// T80/T85 ≈ Tipo 1 (semi-complète) ; T110 ≈ Tipo 2 (complète) ; T150 ≈ intégrale.
// `water` = surcroît d'eau (%) que cette farine absorbe si elle représente 100 % du blé —
// plus l'extraction est haute (son), plus elle boit d'eau.
export const TIPOS = [
  { key: "00", it: "00", fr: "T45", name: "Blanche extra", water: 0 },
  { key: "0", it: "0", fr: "T55–65", name: "Blanche", water: 1 },
  { key: "1", it: "1", fr: "T80", name: "Bise (semi-complète)", water: 3 },
  { key: "2", it: "2", fr: "T110", name: "Complète", water: 5 },
  { key: "integrale", it: "Intégrale", fr: "T150", name: "Intégrale", water: 8 },
];
export const tipoOf = (k) => TIPOS.find((t) => t.key === k);
export const tipoLabel = (k) => { const t = tipoOf(k); return t ? `Tipo ${t.it} · ${t.fr}` : ""; };
// Substitutions (manuel p.32) — remplacer une part du blé par une (ou plusieurs) autres farines.
// Le manuel donne le complément d'EAU DE BASSINAGE (fin de pétrissage) pour 10 % de substitution :
// « Soja, semi complète 10 % → +30 g » · « Farine complète 10 % → +40 g » (le son boit l'eau).
// `bass10` = ce complément en g/kg de farine pour 10 % de substitution ; `max` = part conseillée.
export const SUBSTITUTIONS = [
  // Autres farines de blé (à mélanger avec la farine de base) — plus l'extraction (le son) est haute,
  // plus elles boivent. Valeurs du manuel p.32 : semi-complète 10 % → +30 g ; complète 10 % → +40 g.
  { key: "ble1", label: "Blé Tipo 1 · T80 (semi-complète)", bass10: 30, max: 50, wheat: true },
  { key: "ble2", label: "Blé Tipo 2 · T110 (complète)", bass10: 40, max: 50, wheat: true },
  { key: "bleint", label: "Blé intégrale · T150", bass10: 50, max: 50, wheat: true }, // au-delà de la complète (extrapolé)
  // Autres farines (céréales / graines)
  { key: "soja", label: "Soja", bass10: 30, max: 20 },
  { key: "chataigne", label: "Châtaigne", bass10: 30, max: 20 },
  { key: "seigle", label: "Seigle", bass10: 40, max: 30 },
  { key: "sarrasin", label: "Sarrasin", bass10: 30, max: 20 },
  { key: "mais", label: "Maïs", bass10: 20, max: 20 },
  { key: "epeautre", label: "Épeautre", bass10: 30, max: 40 },
];
export const subOf = (k) => SUBSTITUTIONS.find((s) => s.key === k) || { key: k, label: k, bass10: 0, max: 50 };
// Normalise les substitutions en tableau (compat de l'ancien format `dp.substitution`).
export const subsOf = (dp) => {
  const arr = Array.isArray(dp.substitutions) ? dp.substitutions : (dp && dp.substitution ? [dp.substitution] : []);
  return arr.filter((s) => s && s.key && num(s.pct) > 0);
};

// Ratio pâte/farine. Le COULAGE (dp.hydra) reste calé sur le W ; l'absorption des farines/produits
// (compWaterPct) est ajoutée en EAU DE BASSINAGE (manuel p.32 : « +30 g d'eau de bassinage par unité »).
export const addPctOf = (dp) => 1 + (num(dp.hydra) + num(dp.bassinage) + compWaterPct(dp) + num(dp.sel) + num(dp.huile) + num(dp.levure) + adjonctionsPct(dp)) / 100;

// Dosage de la levure selon la température de la farine (Manuel p.21) — g/kg → % boulanger.
// Fraîche = sèche active ; sèche instantanée = moitié.
export const LEVURE_TYPES = [
  { k: "fraiche", label: "Fraîche" },
  { k: "seche_active", label: "Sèche active" },
  { k: "seche_instant", label: "Sèche instantanée" },
];
export const LEVURE_TABLE = [
  { tmax: 16, fraiche: 0.4, seche_active: 0.4, seche_instant: 0.2 },
  { tmax: 21, fraiche: 0.35, seche_active: 0.35, seche_instant: 0.175 },
  { tmax: 26, fraiche: 0.3, seche_active: 0.3, seche_instant: 0.15 },
  { tmax: 31, fraiche: 0.25, seche_active: 0.25, seche_instant: 0.125 },
  { tmax: 999, fraiche: 0.2, seche_active: 0.2, seche_instant: 0.1 },
];
export const recoLevure = (t, type) => {
  const row = LEVURE_TABLE.find((r) => t <= r.tmax) || LEVURE_TABLE[LEVURE_TABLE.length - 1];
  return row[type] ?? row.fraiche;
};
export const yeastLabel = (k) => (LEVURE_TYPES.find((y) => y.k === k) || LEVURE_TYPES[0]).label;

// Lieu de stockage / fermentation → module la dose de levure. Plus le local est chaud ou la
// maturation longue au froid, moins il faut de levure (le facteur réduit la dose de base).
export const LEVURE_STORAGE = [
  { key: "ambiante", label: "Ambiante", factor: 1, note: "fermentation à température ambiante" },
  { key: "froid", label: "Chambre froide", factor: 0.4, note: "maturation longue au froid → moins de levure" },
];
export const levStorageOf = (k) => LEVURE_STORAGE.find((s) => s.key === k) || LEVURE_STORAGE[0];
// Dose recommandée = table du manuel × facteur de stockage.
// Le paramètre est la température de la FARINE, pas celle du local : c'est ainsi que le
// manuel indexe sa table (p. 19, colonne « Température farine »), et c'est bien `flourTemp`
// que passent les appelants. Le nom précédent (`localTemp`) laissait croire l'inverse.
export const recoLevureFull = (flourTemp, type, storageKey) => {
  const base = recoLevure(tempFarine(flourTemp), type);
  return +(base * levStorageOf(storageKey).factor).toFixed(3);
};

// Tarifs €/kg indicatifs (la farine vient de recipe.flour_price ; le reste de dough_params.prices).
export const PRICE_DEFAULT = { levure: 8, sel: 0.5, huile: 6, ble1: 1.4, ble2: 1.5, bleint: 1.6, soja: 4, chataigne: 9, seigle: 3, sarrasin: 6, mais: 3, epeautre: 4, graines: 12, pf: 1.5, naturkraft: 16, son: 3, charbon: 22 };

/**
 * Calcul complet et PUR d'un empâtement à partir d'une recette {servings, paton_g, flour_price,
 * dough_params}. Renvoie la décomposition, le coût et la fermentation — source unique partagée par
 * l'assistant (PateWizard) et la fiche récapitulative (aucune divergence possible).
 */
export function computeBuild(r) {
  const dp = r.dough_params || {};
  const preset = PRESETS.find((p) => p.nom === dp.preset) || PRESETS[0];
  const napoSpec = preset.nom === "Napolitaine" && dp.napoSpec ? napoSpecOf(dp.napoSpec) : null;
  const w = num(dp.w) || 225;
  const nb = Math.max(1, num(r.servings));
  const patonG = Math.max(1, num(r.paton_g));
  const addPct = addPctOf(dp);
  const dpMode = dp.mode === "farine" ? "farine" : "patons";
  const flourKg = num(dp.flourKg);
  const totalDough = dpMode === "farine" ? Math.max(0, flourKg) * 1000 * addPct : nb * patonG;
  const effNb = dpMode === "farine" ? Math.floor(totalDough / patonG) : nb;
  const reste = dpMode === "farine" ? totalDough - effNb * patonG : 0;
  const farineG = totalDough / addPct;
  const gOf = { farine: farineG, levure: farineG * num(dp.levure) / 100, sel: farineG * num(dp.sel) / 100, huile: farineG * num(dp.huile) / 100 };
  const subs = subsOf(dp);
  const subTotal = Math.min(60, subs.reduce((s, x) => s + num(x.pct), 0));
  const subBassReco = Math.round(substWaterG(dp));
  const compW = compWaterPct(dp); // absorption des farines/produits → part du bassinage
  const totalBass = +(num(dp.bassinage) + compW).toFixed(1);
  const tLabel = tipoLabel(dp.tipo);
  const farineLines = subTotal > 0
    ? [{ k: `Farine de blé${tLabel ? ` · ${tLabel}` : ""}`, pk: "farine", ic: "wheat", v: farineG * (100 - subTotal) / 100, pct: `${+(100 - subTotal).toFixed(1)} %`, color: "#fcb900" },
       ...subs.map((x) => { const m = subOf(x.key); return { k: m.wheat ? m.label : `Farine ${m.label.toLowerCase()}`, pk: x.key, ic: "wheat", v: farineG * num(x.pct) / 100, pct: `${x.pct} %`, color: "#e0ac48" }; })]
    : [{ k: `Farine${tLabel ? ` · ${tLabel}` : ""}`, pk: "farine", ic: "wheat", v: farineG, pct: "100 %", color: "#fcb900" }];
  const levureLine = { k: "Levure", pk: "levure", ic: "yeast", v: gOf.levure, pct: `${dp.levure} %`, color: "#ff6900" };
  const eauLine = { k: "Eau", ic: "droplet", v: farineG * num(dp.hydra) / 100, pct: `${dp.hydra} %`, color: "#3aa0e0" };
  const adjLines = (dp.adjonctions || []).map((a) => { const m = adjOf(a.key); return { k: m.label || a.key, pk: a.key, ic: "wheat", v: farineG * num(a.pct) / 100, pct: `${a.pct} %`, color: "#b9822f" }; });
  const dough = [
    ...farineLines,
    ...(dp.autolyse ? [eauLine, levureLine] : [levureLine, eauLine]),
    { k: "Sel", pk: "sel", ic: "salt", v: gOf.sel, pct: `${dp.sel} %`, color: "#c9cede" },
    ...(num(dp.huile) > 0 ? [{ k: "Huile", pk: "huile", ic: "oil", v: gOf.huile, pct: `${dp.huile} %`, color: "#7bb661" }] : []),
    ...adjLines,
    ...(totalBass > 0 ? [{ k: "Eau de bassinage", ic: "droplet", v: farineG * totalBass / 100, pct: `${totalBass} %`, color: "#7fc7ef" }] : []),
  ];
  const prices = { ...PRICE_DEFAULT, ...(dp.prices || {}), farine: num(r.flour_price) };
  const costLines = dough.filter((l) => l.pk && l.v > 0).map((l) => ({ k: l.pk, label: l.k, g: l.v, eur: (l.v / 1000) * num(prices[l.pk]) }));
  const totalCost = costLines.reduce((s, l) => s + l.eur, 0);
  const costPerPaton = effNb ? totalCost / effNb : 0;
  const costPerKg = totalDough ? totalCost / (totalDough / 1000) : 0;
  const ferment = [num(dp.ambH) > 0 && `${dp.ambH} h à ${dp.ambT || "~22"} °C (ambiant)`, num(dp.ctrlH) > 0 && `${dp.ctrlH} h à ${dp.ctrlT || "3-4"} °C (contrôlé)`].filter(Boolean);
  const flourTemp = tempFarine(dp.flourTemp);
  // Déroulé des étapes (manuel) — adapté à la méthode (pré-ferment / autolyse / direct), aux farines
  // de substitution et aux adjonctions placées à leur moment d'incorporation (p.30).
  const indirect = INDIRECT.includes(dp.method);
  const adjTxt = (phase) => (dp.adjonctions || []).filter((a) => adjOf(a.key).phase === phase).map((a) => `${adjOf(a.key).label.toLowerCase()} ${a.pct} %`).join(", ");
  const flourMix = subTotal > 0 ? ` (blé ${+(100 - subTotal).toFixed(0)} %${subs.map((x) => ` + ${x.pct} % ${subOf(x.key).label.toLowerCase()}`).join("")})` : (tLabel ? ` (${tLabel})` : "");
  const steps = [];
  if (indirect) steps.push({ t: `Pré-ferment (${dp.method})`, d: dp.method === "Biga" ? "Mélanger grossièrement une partie de la farine + eau (≈ 45-50 %) + un peu de levure. Laisser fermenter (souvent 12-18 h)." : "Mélanger farine + eau à parts égales (≈ 100 %) + levure. Laisser fermenter (souvent 2-4 h à T° ambiante, puis au froid)." });
  if (dp.autolyse) {
    steps.push({ t: "Autolyse", d: `Verser l'eau de coulage puis la farine${flourMix} (${dp.hydra} %)${adjTxt("flour") ? ` avec ${adjTxt("flour")}` : ""}. Pétrir 3 mn, laisser reposer 40 mn.` });
    steps.push({ t: "Pétrissage", d: `Reprendre 7 mn en ajoutant la levure${indirect ? " et le pré-ferment" : ""}.` });
  } else {
    steps.push({ t: "Frasage", d: `Mettre la farine${flourMix} et la levure${adjTxt("flour") ? `, avec ${adjTxt("flour")}` : ""}, laisser tourner 1 mn (oxygénation).` });
    steps.push({ t: "Coulage", d: `Verser l'eau (${dp.hydra} %) d'un coup, garder un verre pour le bassinage. Pétrir ≈ 12 mn petite vitesse${indirect ? ", incorporer le pré-ferment" : ""}.` });
  }
  if (adjTxt("knead")) steps.push({ t: "Adjonction", d: `À la 8ᵉ minute, incorporer ${adjTxt("knead")}.` });
  if (adjTxt("beforeSalt")) steps.push({ t: "Adjonction", d: `Avant le sel (≈ 10 mn), ajouter ${adjTxt("beforeSalt")}.` });
  steps.push({ t: "Assaisonnement", d: `Ajouter le sel (${dp.sel} %) petit à petit, puis ${num(dp.huile) > 0 ? `l'huile d'olive (${dp.huile} %)` : "— sans huile"} après 1 mn. Pétrir 2-3 mn.` });
  if (adjTxt("afterOil")) steps.push({ t: "Adjonction", d: `Après l'huile (≈ 12 mn), ajouter ${adjTxt("afterOil")}.` });
  if (totalBass > 0) steps.push({ t: "Bassinage", d: `Ajouter l'eau de bassinage (${totalBass} %) par petits filets${compW > 0 ? ` — dont ${compW} % pour les farines / produits qui absorbent l'eau` : ""}, jusqu'à une texture souple et homogène.` });
  steps.push({ t: "Pointage", d: "Repos en masse après pétrissage (10-40 mn selon la saison). Température de pâte 23-25 °C." });
  steps.push({ t: "Division & boulage", d: `Diviser en ${effNb} pâtons de ${patonG} g, bouler bien serré.` });
  if (ferment.length) steps.push({ t: "Maturation / stockage", d: `${ferment.join(" + ")}.` });
  return { dp, preset, napoSpec, w, dpMode, patonG, totalDough, effNb, reste, farineG, gOf, subs, subTotal, subBassReco, tLabel, dough, prices, costLines, totalCost, costPerPaton, costPerKg, ferment, steps, hydraTotal: +(num(dp.hydra) + totalBass).toFixed(1), flourTemp, eauCoulage: Math.round(50 - 2 * flourTemp) };
}
