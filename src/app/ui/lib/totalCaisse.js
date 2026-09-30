/**
 * LE TOTAL D'UNE VENTE EN CAISSE, AU CENTIME — la même règle que le serveur
 * (src/api/lib/totalCaisse.js, où le défaut est raconté) ; caisse-reglement.test.js confronte les
 * deux copies, et la page à la vraie route d'encaissement.
 *
 * L'écran arrondissait 1,055 € en 1,06 €, le serveur en 1,05 € : il refusait le règlement que la
 * caisse venait de calculer. Des deux côtés désormais : des centimes entiers, et un seul arrondi, le
 * demi-centime vers le haut — celui de la facture.
 */

/** Des euros déjà au centime (12.34, « 12.34 ») en centimes entiers : 1234. */
const enCentimes = (euros) => Math.round(Number(euros) * 100);

/**
 * `lignes` : [{ ht, taux }] — le HT de la ligne en euros, au centime ; le taux de TVA en %, 0 (ou
 * absent) quand elle ne s'applique pas. Rend { ht, tva, ttc } en euros, chacun au centime, et
 * ht + tva vaut ttc exactement.
 */
export function totalCaisse(lignes) {
  let ht = 0;
  let tvaExacte = 0; // en cent-millièmes de centime : centimes × millièmes de point
  for (const l of lignes) {
    const c = enCentimes(l.ht);
    ht += c;
    tvaExacte += c * Math.round(Number(l.taux || 0) * 1000);
  }
  const tva = Math.floor((tvaExacte + 50000) / 100000); // au centime ; le demi, vers le haut
  return { ht: ht / 100, tva: tva / 100, ttc: (ht + tva) / 100 };
}
