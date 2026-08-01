/**
 * Remise réservée aux stagiaires — le calcul, et lui seul.
 *
 * EXTRAIT DES CONTRÔLEURS parce qu'il sert désormais à TROIS endroits : le catalogue de la
 * boutique stagiaire, le prix retenu à la commande, et l'écran d'inventaire côté école (qui
 * montre à l'organisme l'effet de la remise qu'il vient de régler). Trois copies auraient fini
 * par diverger d'un centime, et le stagiaire aurait payé autre chose que le prix affiché.
 *
 * Aucune dépendance : ni base, ni requête. C'est ce qui permet de l'exécuter tel quel en test.
 */

/**
 * Prix stagiaire d'un article : { brut, net, taux, libelle }.
 *
 * UN SEUL ENDROIT pour les deux usages — le prix affiché au catalogue et celui retenu à la
 * commande. Deux calculs séparés finiraient par diverger d'un centime, et le stagiaire paierait
 * autre chose que ce qu'il a vu.
 *
 * Le MONTANT prime sur le taux : c'est la promesse la plus concrète (« la pelle, 35 € pour toi »).
 * Bornes : jamais en dessous de zéro — une remise de 50 € sur un article à 40 € le rendrait
 * gratuit, voire créditeur, et une saisie malheureuse ne doit pas payer le stagiaire.
 * Arrondi au centime AVANT multiplication, comme partout ailleurs (cf. sale.controller).
 */
function prixStagiaire(it) {
    const brut = Number(it.unit_price) || 0;
    const eur = Math.max(0, Number(it.learner_discount_eur) || 0);
    const pct = Math.min(100, Math.max(0, Number(it.learner_discount_pct) || 0));
    let net = brut;
    let libelle = null;
    if (eur > 0) {
        net = Number(Math.max(0, brut - eur).toFixed(2));
        // Libellé bâti sur la réduction RÉELLE et non sur le montant réglé : une remise de 50 €
        // saisie sur un article à 12 € afficherait « −50,00 € » à côté d'un prix à zéro. Le
        // stagiaire lit une promesse que le prix dément.
        libelle = `−${(brut - net).toFixed(2).replace('.', ',')} €`;
    } else if (pct > 0) {
        net = Number((brut * (1 - pct / 100)).toFixed(2));
        libelle = `−${Number.isInteger(pct) ? pct : pct.toFixed(2).replace('.', ',')} %`;
    }
    // Taux EFFECTIF, quelle que soit la forme saisie : c'est lui qu'on fige sur la ligne, pour
    // que la facture affiche une remise même quand elle a été donnée en euros.
    const taux = brut > 0 && net < brut ? Number(((1 - net / brut) * 100).toFixed(2)) : 0;
    return { brut, net, taux, libelle };
}

module.exports = { prixStagiaire };
