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

export function addToCart(line) {
  const lines = read();
  const i = lines.findIndex((l) => lineKey(l) === lineKey(line));
  if (i >= 0) lines[i].qty = Math.min(99, lines[i].qty + (line.qty || 1));
  else lines.push({ ...line, qty: Math.min(99, line.qty || 1) });
  write(lines);
}
export function setQty(key, qty) {
  const lines = read();
  const i = lines.findIndex((l) => lineKey(l) === key);
  if (i < 0) return;
  if (qty <= 0) lines.splice(i, 1); else lines[i].qty = Math.min(99, qty);
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
