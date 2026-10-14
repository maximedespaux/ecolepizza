/**
 * LES 14 ALLERGÈNES À DÉCLARATION OBLIGATOIRE — côté serveur (migration 208, demandé le 2026-10-14).
 *
 * La liste (cle/nom) et l'ordre reprennent EXACTEMENT le référentiel de l'écran
 * (src/app/ui/lib/allergenes.js, « la liste du manuel, dans son ordre ») : `allergenes.test.js`
 * confronte les deux. Le serveur ne garde que ce dont il a besoin — valider et lire les cle cochées
 * sur une fiche ; le référentiel ingrédient → allergène (porte/verdict) reste côté écran, il ne sert
 * qu'au mini-jeu.
 */
const ALLERGENES = [
    { cle: 'gluten', nom: 'Gluten' },
    { cle: 'crustaces', nom: 'Crustacés' },
    { cle: 'oeufs', nom: 'Œufs' },
    { cle: 'poissons', nom: 'Poissons' },
    { cle: 'arachides', nom: 'Arachides' },
    { cle: 'soja', nom: 'Soja' },
    { cle: 'lait', nom: 'Lait' },
    { cle: 'fruits_a_coque', nom: 'Fruits à coque' },
    { cle: 'celeri', nom: 'Céleri' },
    { cle: 'moutarde', nom: 'Moutarde' },
    { cle: 'sesame', nom: 'Sésame' },
    { cle: 'lupin', nom: 'Lupin' },
    { cle: 'mollusques', nom: 'Mollusques' },
    { cle: 'sulfites', nom: 'Sulfites' },
];

const CODES = ALLERGENES.map((a) => a.cle);
const CLES = new Set(CODES);

/** Ne garde que des cle CONNUES, uniques, dans l'ordre du manuel (l'entrée vient d'un client). */
function normaliserAllergenes(input) {
    const vus = new Set((Array.isArray(input) ? input : []).filter((x) => CLES.has(x)));
    return CODES.filter((c) => vus.has(c));
}

/** Lecture d'une valeur STOCKÉE (chaîne JSON, tableau, ou null/vide) → tableau de cle valides. */
function parseAllergenes(stored) {
    if (!stored) return [];
    let v = stored;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
    return normaliserAllergenes(v);
}

const nomAllergene = (cle) => (ALLERGENES.find((a) => a.cle === cle) || {}).nom || String(cle || '');

module.exports = { ALLERGENES, CODES, normaliserAllergenes, parseAllergenes, nomAllergene };
