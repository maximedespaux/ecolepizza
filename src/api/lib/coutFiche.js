/**
 * COÛT UNITAIRE D'UNE FICHE — la part du calcul que le serveur doit faire lui-même.
 *
 * Quand une réalisation importe une garniture, c'est le prix calculé ICI (`ficheUnitCost`,
 * recipe.controller.js) qui entre dans la réalisation. Il devait donc être le même que celui
 * que l'éditeur affiche et que la fiche imprime — ce qu'il n'était pas : l'éditeur et l'import
 * divisaient par un rendement de 1 000 g posé par défaut, l'impression par le poids des
 * ingrédients. 8,40 €/kg d'un côté, 3,28 €/kg de l'autre, pour la même sauce.
 *
 * La règle vit à deux endroits parce que le front et l'API ne partagent pas de modules :
 * src/app/ui/lib/coutFiche.js (l'écran) et ce fichier. `fiche-cout.test.js` les confronte
 * sur les mêmes cas — l'un ne peut pas bouger sans l'autre.
 */

/* Diviseur vers le kilo (1 L compté pour 1 kg). */
const MASS_VOL = { g: 1000, kg: 1, mg: 1e6, l: 1, ml: 1000, cl: 100 };

const nombre = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Coût d'une ligne : g au prix du kilo, ou pièces au prix de la pièce. */
const coutLigne = (t) => (t.unit === 'piece'
    ? nombre(t.qty) * nombre(t.unit_price)
    : (nombre(t.qty) / 1000) * nombre(t.unit_price));

/** Poids connu des ingrédients, en grammes : une pièce ne pèse rien faute de poids connu. */
const poidsIngredients = (lignes) => (lignes || []).reduce((s, t) => s + (t.unit === 'piece' ? 0 : nombre(t.qty)), 0);

/**
 * Coût unitaire d'une préparation : rendement déclaré s'il y en a un, sinon le poids des
 * ingrédients, sinon le lot entier. Même contrat que `prixUnitairePreparation` côté écran.
 */
function prixUnitairePreparation(total, poidsG, yieldQty, yieldUnit) {
    const y = nombre(yieldQty);
    const u = String(yieldUnit || '').toLowerCase();
    if (y > 0 && MASS_VOL[u]) { const kg = y / MASS_VOL[u]; return { unit: 'g', unitPrice: total / kg, quantite: kg, source: 'rendement' }; }
    if (y > 0) return { unit: 'piece', unitPrice: total / y, quantite: y, source: 'rendement' };
    if (poidsG > 0) { const kg = poidsG / 1000; return { unit: 'g', unitPrice: total / kg, quantite: kg, source: 'poids' }; }
    return { unit: 'piece', unitPrice: total, quantite: 1, source: 'lot' };
}

module.exports = { MASS_VOL, coutLigne, poidsIngredients, prixUnitairePreparation };
