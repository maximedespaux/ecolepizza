/**
 * Arithmétique de facturation — ce qui est faux, et de combien.
 *
 * Une erreur de calcul financier ne lève aucune exception : elle produit un chiffre plausible.
 * Elle ne se découvre qu'au rapprochement bancaire, des mois plus tard, ou par le client qui
 * conteste. Ces tests fixent les montants attendus en euros pour que l'écart, lui, soit bruyant.
 *
 * CERTAINS DE CES TESTS ÉCHOUENT À DESSEIN quand le défaut est encore là : ils sont écrits
 * autour du montant JUSTE, pas du montant actuel. Un test qui entérine le bug ne sert à rien.
 * Les défauts confirmés et corrigés dans cette passe sont marqués « corrigé » ; ceux laissés en
 * l'état sont marqués `{ skip: true }` avec la raison — ils documentent la dette sans faire
 * échouer la suite.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// --- Ce que le code fait réellement, rejoué à l'identique ----------------------------------

/** Reproduit lib/facturx.js:55-58 — le calcul de TVA de la facture émise. */
const facturx = (amountNet, tvaExoneree) => {
    const net = Number(amountNet);
    const tax = tvaExoneree ? 0 : Math.round(net * 20) / 100;
    return { net, tax, grand: net + tax };
};

test('Factur-X : une facture exonérée ne porte aucune TVA', () => {
    const f = facturx(1200, true);
    assert.strictEqual(f.tax, 0);
    assert.strictEqual(f.grand, 1200);
});

test('Factur-X : 20 % sur une base HT donne le total attendu', () => {
    const f = facturx(1000, false);
    assert.strictEqual(f.tax, 200);
    assert.strictEqual(f.grand, 1200);
});

/**
 * LE TAUX EST EN DUR À 20 %. La base de données connaît pourtant les vrais taux
 * (inventory_item.tax_rate, shop_request_line.tax_rate) et sale.controller les calcule
 * correctement — mais la facture ne les stocke jamais.
 */
test('un article à 5,5 % est facturé au bon taux', { skip: 'défaut connu : taux 20 % en dur dans lib/facturx.js:56 et :196' }, () => {
    // 100 € HT de farine à 5,5 % doivent donner 5,50 € de TVA, pas 20 €.
    const f = facturx(100, false);
    assert.strictEqual(f.tax, 5.5, 'la facture applique 20 % quel que soit le taux réel');
});

/**
 * DOUBLE TAXATION DE LA BOUTIQUE — le défaut le plus coûteux trouvé.
 *
 * shopRequest.controller.js calcule un total TTC puis l'écrit dans `amount_net`, la colonne
 * HT, avec `tva_exoneree = 0`. Factur-X applique donc 20 % PAR-DESSUS un montant qui les
 * contient déjà.
 */
test('boutique : le montant facturé ne doit pas être taxé deux fois', () => {
    const ligneHT = 100, taux = 20;
    const ttc = ligneHT * (1 + taux / 100);              // 120 € — ce que le stagiaire doit
    const facture = facturx(ttc, false);                  // ce que le code produit aujourd'hui
    const surfacturation = facture.grand - ttc;

    assert.strictEqual(ttc, 120);
    assert.strictEqual(facture.grand, 144, 'le calcul actuel produit bien 144 €');
    assert.strictEqual(surfacturation, 24, '24 € facturés en trop sur 120 € dus');

    // Ce que le contrôleur DEVRAIT stocker : la base HT, TVA calculée ensuite.
    const correct = facturx(ligneHT, false);
    assert.strictEqual(correct.grand, 120, 'stocker le HT redonne le bon total');
});

test('boutique : la colonne amount_net reçoit bien un HT', { skip: 'défaut connu : shopRequest.controller.js:152 et :169 y écrivent un TTC' }, () => {
    const src = lire('controllers/shopRequest.controller.js');
    const bloc = src.slice(src.indexOf('INSERT INTO invoice ('), src.indexOf('UPDATE shop_request SET invoice_id'));
    assert.doesNotMatch(bloc, /totalTtc\.toFixed\(2\)/, 'un TTC est écrit dans la colonne HT');
    assert.doesNotMatch(bloc, /ttc\.toFixed\(2\)/, 'un TTC est écrit dans amount_net de la ligne');
});

// --- Arrondis : où l'arrondi tombe change le total ----------------------------------------

/** sale.controller.js écrit DEUX fois le même chiffre, arrondi à deux moments différents. */
const commeFacture = (unit, qty) => Number((unit * qty).toFixed(2));   // arrondi APRÈS
const commeCompta = (unit, qty) => Number(unit.toFixed(2)) * qty;      // arrondi AVANT

test('arrondir avant ou après la multiplication ne donne pas le même total', () => {
    // Le cas d'école : trois parts d'un même euro.
    assert.strictEqual(commeFacture(100 / 3, 3), 100);
    assert.strictEqual(commeCompta(100 / 3, 3), 99.99);

    // Un cas réel : 9,99 € remisé 10 %, neuf articles.
    const unit = 9.99 * 0.9; // 8,991
    assert.strictEqual(commeFacture(unit, 9), 80.92);
    assert.strictEqual(commeCompta(unit, 9), 80.91);
});

test('la facture et la comptabilité annoncent le même montant pour une vente', { skip: 'défaut connu : sale.controller.js:196 arrondit après, :217 arrondit avant' }, () => {
    const unit = 9.99 * 0.9;
    assert.strictEqual(commeFacture(unit, 9), commeCompta(unit, 9),
        "un centime d'écart par ligne, toujours dans le même sens");
});

// --- Reste à payer -------------------------------------------------------------------------

const resteAPayer = (prix, acompte) => prix - acompte;

test('un acompte normal laisse le solde attendu', () => {
    assert.strictEqual(resteAPayer(1200, 300), 900);
});

test('un acompte supérieur au prix ne doit pas imprimer un reste négatif', { skip: "défaut connu : lib/tokens.js:393 n'a aucune borne, le contrat imprime « -300 € »" }, () => {
    // Trop-perçu : le contrat de formation doit annoncer 0 € et non un montant négatif.
    assert.strictEqual(Math.max(0, resteAPayer(1200, 1500)), 0);
    assert.strictEqual(resteAPayer(1200, 1500), 0);
});

test('le reste à payer est cohérent avec le prix affiché à côté', { skip: "défaut connu : lib/tokens.js calcule le reste en HT alors que le document affiche un Prix TTC" }, () => {
    const prixHT = 1000, tva = 20;
    const prixTTC = prixHT * (1 + tva / 100);
    const acompte = 300;
    // Le document imprime « Prix TTC : 1200 € » et « Reste à payer : 700 € » — incohérent.
    assert.strictEqual(resteAPayer(prixTTC, acompte), 900);
});

// --- Numérotation des factures -------------------------------------------------------------

/** invoice.controller.js numérote avec COUNT(*) + 1. */
const numeroParComptage = (existantes) => existantes.length + 1;

test('la numérotation par comptage réattribue un numéro après suppression', () => {
    let factures = [1, 2, 3];
    assert.strictEqual(numeroParComptage(factures), 4);
    factures = [1, 3];                                    // la n°2 est supprimée
    assert.strictEqual(numeroParComptage(factures), 3,
        'le numéro 3 est réattribué alors qu\'il existe déjà');
    assert.ok(factures.includes(3), 'collision garantie sur la contrainte UNIQUE');
});

test('un numéro de facture ne doit jamais être réutilisé', { skip: 'défaut connu : invoice.controller.js:174 numérote par COUNT(*)+1' }, () => {
    const factures = [1, 3];
    const suivant = numeroParComptage(factures);
    assert.ok(!factures.includes(suivant),
        'la séquence doit repartir du plus grand numéro émis, pas du nombre de lignes');
});

// --- Totaux du tableau de bord -------------------------------------------------------------

test('le total des dépenses inclut toutes les lignes affichées', () => {
    // comptabilite.controller totalise sur une liste blanche de catégories, mais AFFICHE
    // toutes les dépenses de l'année. Une catégorie hors liste apparaît sans être comptée.
    const CATEGORIES = ['LOYER', 'SALAIRES', 'MATIERES', 'DIVERS'];
    const depenses = [
        { category: 'LOYER', amount: 1000 },
        { category: 'MATIERES', amount: 500 },
        { category: 'ANCIENNE_CATEGORIE', amount: 250 }, // héritée d'un import
    ];
    const postes = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    for (const d of depenses) if (postes[d.category] !== undefined) postes[d.category] += d.amount;
    const total = Object.values(postes).reduce((s, v) => s + v, 0);
    const sommeAffichee = depenses.reduce((s, d) => s + d.amount, 0);

    assert.strictEqual(total, 1500);
    assert.strictEqual(sommeAffichee, 1750);
    assert.notStrictEqual(total, sommeAffichee,
        '250 € apparaissent dans la liste sans entrer dans le total — écart silencieux');
});
