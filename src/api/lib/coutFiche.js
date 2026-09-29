/**
 * COÛT UNITAIRE D'UNE FICHE — la part du calcul que le serveur doit faire lui-même.
 *
 * Quand une réalisation importe une préparation, c'est le prix calculé ICI (`ficheUnitCost`,
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

/* ── L'EMPÂTEMENT ──────────────────────────────────────────────────────────────────────────
 *
 * Le coût d'une pâte, c'est la FARINE, le SEL, l'HUILE et la LEVURE (décidé par l'école le
 * 2026-09-29) — plus les farines de substitution et les adjonctions quand la fiche en porte. Il
 * avait trois valeurs : l'éditeur et l'import ne comptaient que la farine, l'impression et la
 * Communauté tout le reste (`computeBuild`, src/app/ui/lib/dough.js). C'est désormais le calcul
 * de `computeBuild` partout, et ce fichier en est la COPIE SERVEUR — `fiche-cout.test.js`
 * confronte les deux, tables comprises : une valeur changée d'un seul côté le fait rougir.
 *
 * L'eau ne coûte rien (elle n'a pas de prix). Les prix : ceux de la fiche (`dough_params.prices`)
 * s'il y en a, sinon les prix indicatifs ci-dessous ; la farine, toujours `flour_price`. */
const PRIX_PATE = { levure: 8, sel: 0.5, huile: 6, ble1: 1.4, ble2: 1.5, bleint: 1.6, soja: 4, chataigne: 9, seigle: 3, sarrasin: 6, mais: 3, epeautre: 4, graines: 12, pf: 1.5, naturkraft: 16, son: 3, charbon: 22 };
/* Eau de bassinage d'une farine de substitution (g par kg de farine, pour 10 %). */
const BASSINAGE_SUBSTITUTION = { ble1: 30, ble2: 40, bleint: 50, soja: 30, chataigne: 30, seigle: 40, sarrasin: 30, mais: 20, epeautre: 30 };
/* Eau que boit une adjonction (facteur sur son pourcentage). */
const EAU_ADJONCTION = { graines: 1, pf: 0, naturkraft: 0, son: 0, charbon: 0 };
/* Surcroît d'eau (%) d'une farine de blé selon son type / tipo, si elle fait 100 % du blé. */
const EAU_TIPO = { '00': 0, '0': 1, '1': 3, '2': 5, integrale: 8 };
/* Au-delà de 60 % de substitution, ce n'est plus une pâte à pizza : les parts sont ramenées. */
const SUB_MAX = 60;

const substitutions = (dp) => {
    const arr = Array.isArray(dp.substitutions) ? dp.substitutions : (dp && dp.substitution ? [dp.substitution] : []);
    const subs = arr.filter((x) => x && x.key && nombre(x.pct) > 0);
    const brut = subs.reduce((s, x) => s + nombre(x.pct), 0);
    if (brut <= SUB_MAX) return subs;
    const k = SUB_MAX / brut;
    return subs.map((x) => ({ ...x, pct: +(nombre(x.pct) * k).toFixed(2) }));
};
const eauDeCompensation = (dp, subs) => {
    const subst = subs.reduce((s, x) => s + (BASSINAGE_SUBSTITUTION[x.key] || 0) * (nombre(x.pct) / 10), 0);
    const adj = (dp.adjonctions || []).reduce((s, a) => s + nombre(a.pct) * (EAU_ADJONCTION[a.key] || 0), 0);
    const ble = Math.max(0, 100 - subs.reduce((s, x) => s + nombre(x.pct), 0));
    const tipo = (EAU_TIPO[dp.tipo] || 0) * (ble / 100);
    return +(subst / 10 + adj + tipo).toFixed(2);
};

/**
 * Coût d'un empâtement : { total, parPaton, parKg, patons, poids } — les `totalCost`,
 * `costPerPaton`, `costPerKg`, `effNb` et `totalDough` de `computeBuild`.
 */
function coutPate(r) {
    let dp = r.dough_params;
    if (typeof dp === 'string') { try { dp = JSON.parse(dp); } catch { dp = null; } }
    dp = dp || {};
    const subs = substitutions(dp);
    const adjonctions = (dp.adjonctions || []).reduce((s, a) => s + nombre(a.pct), 0);
    const ratio = 1 + (nombre(dp.hydra) + nombre(dp.bassinage) + eauDeCompensation(dp, subs) + nombre(dp.sel)
        + nombre(dp.huile) + nombre(dp.levure) + adjonctions) / 100;
    const patonG = Math.max(1, nombre(r.paton_g));
    const parFarine = dp.mode === 'farine';
    const poids = parFarine ? Math.max(0, nombre(dp.flourKg)) * 1000 * ratio : Math.max(1, nombre(r.servings)) * patonG;
    const patons = parFarine ? Math.floor(poids / patonG) : Math.max(1, nombre(r.servings));
    const farineG = poids / ratio;
    const partSubs = subs.reduce((s, x) => s + nombre(x.pct), 0);
    const prix = { ...PRIX_PATE, ...(dp.prices || {}), farine: nombre(r.flour_price) };
    const lignes = [
        ['farine', farineG * (100 - partSubs) / 100],
        ...subs.map((x) => [x.key, farineG * nombre(x.pct) / 100]),
        ['levure', farineG * nombre(dp.levure) / 100],
        ['sel', farineG * nombre(dp.sel) / 100],
        ['huile', farineG * nombre(dp.huile) / 100],
        ...(dp.adjonctions || []).map((a) => [a.key, farineG * nombre(a.pct) / 100]),
    ];
    const total = lignes.filter(([, g]) => g > 0).reduce((s, [cle, g]) => s + (g / 1000) * nombre(prix[cle]), 0);
    return { total, parPaton: patons ? total / patons : 0, parKg: poids ? total / (poids / 1000) : 0, patons, poids };
}

module.exports = {
    MASS_VOL, coutLigne, poidsIngredients, prixUnitairePreparation,
    coutPate, PRIX_PATE, BASSINAGE_SUBSTITUTION, EAU_ADJONCTION, EAU_TIPO, SUB_MAX,
};
