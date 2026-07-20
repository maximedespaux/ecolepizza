/**
 * Panier de la boutique stagiaire.
 *
 * Le panier est un BROUILLON D'INTERFACE, pas une donnée : il ne vit que le temps de composer
 * la demande, et c'est la DEMANDE (API + base) qui fait foi dès qu'on valide. D'où le
 * localStorage — il évite juste de tout reperdre si le stagiaire recharge la page au milieu.
 * Rien de ce qui compte n'y est stocké : ni prix (relus en base au moment de valider), ni
 * identité, ni historique. Ses demandes passées viennent de l'API.
 */

const KEY = "impasto.panier.v1";
const EVT = "impasto:panier";

/**
 * Une ligne : { source, id, label, price_ht, tax_rate, qty, personalizable, variants, nom, prenom, taille, coupe }.
 *
 * `nom` / `prenom` = ce qu'on brode (veste Molinel). Ils sont SÉPARÉS et pas concaténés :
 * il faut pouvoir corriger une faute dans le panier sans redécouper une chaîne. Ils ne sont
 * assemblés qu'au moment d'envoyer.
 *
 * `taille` / `coupe` = la déclinaison (« L », « Femme »). Ce n'est PAS une broderie : c'est
 * le produit qu'on sort du carton. L'inventaire ne tient qu'une ligne « Veste brodée Molinel »,
 * donc la taille ne peut vivre que sur la demande.
 *
 * Les quatre font partie de l'IDENTITÉ de la ligne (cf. lineKey) : deux vestes brodées à deux
 * noms — ou à deux tailles — sont deux lignes distinctes, pas une ligne de quantité 2. Sinon
 * on broderait le même nom sur les deux, ou on sortirait deux fois la même taille.
 */
export const lineKey = (l) => `${l.source}|${l.id}|${(l.nom || "").trim()}|${(l.prenom || "").trim()}|${l.taille || ""}|${l.coupe || ""}`;

const read = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; }
  catch { return []; }
};
const write = (lines) => {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* mode privé : tant pis */ }
  window.dispatchEvent(new CustomEvent(EVT));
};

export const getCart = read;
export const cartCount = () => read().reduce((s, l) => s + l.qty, 0);

/** Ce qu'on brode, tel qu'il partira à l'API : « DUPONT Marie ». */
export const brodValue = (l) => `${(l.nom || "").trim().toUpperCase()} ${(l.prenom || "").trim()}`.trim();
/** Déclinaison telle qu'elle partira à l'API : « L · Femme ». */
export const variantValue = (l) => (l.taille && l.coupe ? `${l.taille} · ${l.coupe}` : null);
/** Ligne textile complète ? Nom, prénom, taille ET coupe — les quatre. */
export const brodOk = (l) => !l.personalizable
  || (!!String(l.nom || "").trim() && !!String(l.prenom || "").trim() && !!l.taille && !!l.coupe);

/**
 * Plafond d'une ligne : le stock DISPONIBLE relevé à l'ajout (`stock`, servi par l'API),
 * sinon 99. Une ligne partenaire n'a pas de stock chez nous — le partenaire vend le sien.
 *
 * Ce plafond est du CONFORT D'INTERFACE : il évite de composer un panier qu'on devra
 * refuser. Il peut être périmé (l'école réassortit, un autre stagiaire commande), donc il
 * ne fait pas autorité — c'est le serveur qui tranche à la validation.
 */
const stockMax = (l) => (l.stock == null ? 99 : Math.max(0, Number(l.stock) || 0));

/**
 * Quantité déjà au panier pour un ARTICLE, toutes lignes confondues.
 * Une veste en M et la même en L sont deux lignes (la déclinaison les sépare) mais tirent
 * sur le même article d'inventaire : le stock se compte donc par article, pas par ligne.
 */
export const qtyForItem = (lines, source, id) =>
  lines.filter((l) => l.source === source && l.id === id).reduce((s, l) => s + l.qty, 0);

/** Ce qu'on peut ENCORE ajouter pour cet article, compte tenu du panier. */
export function roomFor(line, lines = read()) {
  return Math.max(0, Math.min(99, stockMax(line)) - qtyForItem(lines, line.source, line.id));
}

/** Ajoute au panier sans dépasser le stock. Renvoie `false` si le plafond est déjà atteint. */
export function addToCart(line) {
  const lines = read();
  const room = roomFor(line, lines);
  if (room <= 0) return false;
  const add = Math.min(line.qty || 1, room);
  const i = lines.findIndex((l) => lineKey(l) === lineKey(line));
  if (i >= 0) lines[i].qty += add;
  else lines.push({ ...line, qty: add });
  write(lines);
  return true;
}
export function setQty(key, qty) {
  const lines = read();
  const i = lines.findIndex((l) => lineKey(l) === key);
  if (i < 0) return;
  if (qty <= 0) { lines.splice(i, 1); write(lines); return; }
  const l = lines[i];
  // Ce que prennent les AUTRES lignes du même article : la quantité demandée ici ne peut
  // pas empiéter dessus.
  const autres = qtyForItem(lines, l.source, l.id) - l.qty;
  lines[i].qty = Math.max(1, Math.min(qty, Math.min(99, stockMax(l)) - autres));
  write(lines);
}
/** Corrige la broderie ou la déclinaison d'une ligne (clé AVANT modification). */
export function setBroderie(key, patch) {
  const lines = read();
  const i = lines.findIndex((l) => lineKey(l) === key);
  if (i < 0) return;
  for (const f of ["nom", "prenom", "taille", "coupe"]) {
    if (patch[f] !== undefined) lines[i][f] = String(patch[f]).slice(0, 60);
  }
  write(lines);
}
export const removeFromCart = (key) => setQty(key, 0);
export const clearCart = () => write([]);

/* Total indicatif : une ligne partenaire « tarif sur demande » n'a pas de prix — on ne
   l'additionne pas et l'appelant doit le signaler, sinon le total ment. */
export function cartTotals(lines = read()) {
  let ht = 0, ttc = 0, aDefinir = false;
  for (const l of lines) {
    if (l.price_ht == null) { aDefinir = true; continue; }
    ht += l.price_ht * l.qty;
    ttc += l.price_ht * l.qty * (1 + (l.tax_rate ?? 20) / 100);
  }
  return { ht: +ht.toFixed(2), ttc: +ttc.toFixed(2), aDefinir };
}

export const CART_EVENT = EVT;
