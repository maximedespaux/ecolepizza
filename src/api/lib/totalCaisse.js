/**
 * LE TOTAL D'UNE VENTE EN CAISSE, AU CENTIME — le même à l'écran et au serveur.
 *
 * Relevé le 2026-09-30 : l'écran (pages/Ventes.jsx) et le serveur (sale.controller.js, `checkout`)
 * additionnaient les mêmes lignes, puis arrondissaient chacun à sa façon. Ils se séparaient quand la
 * TVA tombait sur un DEMI-CENTIME : un article à 1,00 € HT à 5,5 % porte 0,055 € de TVA. L'écran
 * arrondissait 1,055 € par `Math.round(x * 100)` — 1,06 € —, le serveur par `toFixed(2)` — 1,05 €,
 * parce que le flottant « 1,055 » vaut en vérité 1,05499999… Le serveur refusait alors le règlement
 * que l'écran venait de calculer, et que l'opérateur ne pouvait pas corriger : le solde du dernier
 * moyen ne se saisit pas. Pour un article seul entre 0,05 et 200 € HT : 16 prix refusés à 5,5 %
 * (1,00 · 29,00 · 51,00 €…), 296 à 10 % (0,45 · 0,75 · 0,95 €…), aucun à 20 % — un cinquième d'un
 * nombre de centimes ne tombe jamais sur un demi.
 *
 * D'OÙ DES CENTIMES ENTIERS ET UN SEUL ARRONDI, écrits une fois ici et une fois pour l'écran
 * (src/app/ui/lib/totalCaisse.js) ; caisse-reglement.test.js confronte les deux copies, et le vrai
 * contrôleur à la vraie formule de la page. La TVA exacte se compte en entiers — HT en centimes ×
 * taux en millièmes de point —, sans un flottant, puis s'arrondit UNE fois au centime, le
 * demi-centime vers le haut. C'est l'arrondi de la facture (`ventilerTva`, lib/facturx.js :
 * `Math.round(base * taux)`) : un article seul s'encaisse exactement au total que le PDF imprimera.
 *
 * ⚠️ SUR PLUSIEURS TAUX, la facture arrondit la TVA PAR TAUX, la caisse une fois sur le tout : les
 * deux peuvent différer d'un centime (CLAUDE.md § 3, « Un centime de tolérance »). Ce n'est PAS
 * réglé ici : ce serait changer ce que la caisse encaisse, une décision à part. Sur plusieurs
 * lignes d'un MÊME taux, le PDF additionne des flottants avant d'arrondir : sur un demi-centime, sa
 * somme passe parfois juste en dessous, et il imprime un centime de moins (0,26 % de 300 000
 * paniers tirés au hasard, de 2 à 5 lignes ; l'ancien écran en différait sur 0,52 %, l'ancien
 * serveur sur 1,6 %).
 *
 * Les HT de LIGNE arrivent déjà au centime (prix unitaire remisé arrondi, puis multiplié, puis
 * arrondi — sale.controller.js dit pourquoi) : ce module les additionne, il ne les recalcule pas.
 */

/** Des euros déjà au centime (12.34, « 12.34 ») en centimes entiers : 1234. */
const enCentimes = (euros) => Math.round(Number(euros) * 100);

/**
 * `lignes` : [{ ht, taux }] — le HT de la ligne en euros, au centime ; le taux de TVA en %, 0 (ou
 * absent) quand elle ne s'applique pas. Rend { ht, tva, ttc } en euros, chacun au centime, et
 * ht + tva vaut ttc exactement.
 */
function totalCaisse(lignes) {
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

module.exports = { totalCaisse };
