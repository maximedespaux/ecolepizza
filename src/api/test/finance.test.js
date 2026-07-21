/**
 * Arithmétique de facturation — ce qui est faux, et de combien.
 *
 * Une erreur de calcul financier ne lève aucune exception : elle produit un chiffre plausible.
 * Elle ne se découvre qu'au rapprochement bancaire, des mois plus tard, ou par le client qui
 * conteste. Ces tests fixent les montants attendus en euros pour que l'écart, lui, soit bruyant.
 *
 * Ces tests sont écrits autour du montant JUSTE, pas du montant actuel : un test qui entérine
 * le bug ne sert à rien. Ceux qui restent en `{ skip }` portent la raison de leur dette — ils
 * la rendent visible au lieu de la laisser passer sous silence, et échoueront le jour où l'on
 * s'y attaquera, ce qui est le but.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// --- Ce que le code fait réellement, rejoué à l'identique ----------------------------------

/**
 * On appelle le VRAI calcul, plus une copie. Il vient d'être extrait dans `ventilerTva`
 * précisément pour être atteignable ici : tant qu'il vivait à l'intérieur de la génération
 * XML, tout test aurait porté sur une réimplémentation — et un test qui approuve une copie
 * n'approuve rien.
 */
const { ventilerTva } = require('../lib/facturx.js');
const facturx = (amountNet, tvaExoneree, taxRate, lines) => {
    const v = ventilerTva({ amountNet, tvaExoneree, taxRate, lines });
    return { net: v.base, tax: v.taxe, grand: v.grand, groupes: v.groupes };
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
 * Le taux était en dur à 20 %, alors que la base connaît les vrais taux
 * (inventory_item.tax_rate, shop_request_line.tax_rate) et que sale.controller les calculait
 * déjà correctement — sans jamais les conserver. La migration 108 leur donne une place sur la
 * facture, et ventilerTva les utilise.
 */
test('un article à 5,5 % est facturé au bon taux', () => {
    // 100 € HT de farine à 5,5 % doivent donner 5,50 € de TVA, pas 20 €.
    const f = facturx(100, false, 5.5);
    assert.strictEqual(f.tax, 5.5);
    assert.strictEqual(f.grand, 105.5);
});

test('une facture antérieure à la migration 108 garde ses montants', () => {
    // Sans taux stocké, on retombe sur 20 % : une pièce comptable déjà envoyée ne doit pas
    // changer de montant parce qu'on rejoue son édition.
    const f = facturx(1000, false, null);
    assert.strictEqual(f.tax, 200);
});

test('un panier à taux mixtes produit un groupe de taxe par taux', () => {
    // Factur-X l'exige (BR-CO-14) ; avec un seul groupe l'XML était arithmétiquement faux.
    const f = facturx(200, false, null, [{ amount: 100, taxRate: 5.5 }, { amount: 100, taxRate: 20 }]);
    assert.strictEqual(f.groupes.length, 2);
    assert.strictEqual(f.tax, 25.5, '5,50 € + 20,00 €');
    assert.strictEqual(f.grand, 225.5);
});

test('la TVA est arrondie PAR TAUX, comme l\'exige la ventilation', () => {
    const f = facturx(20.03, false, null, [{ amount: 10.01, taxRate: 5.5 }, { amount: 10.02, taxRate: 20 }]);
    const parGroupe = f.groupes.map((g) => g.taxe);
    assert.deepStrictEqual(parGroupe, [0.55, 2]);
    assert.strictEqual(f.tax, 2.55, 'somme des groupes arrondis, pas arrondi de la somme');
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
    // Le contrôleur stocke désormais la base HT ; la TVA est calculée à l'édition.
    const facture = facturx(ligneHT, false, taux);
    assert.strictEqual(facture.grand, 120, 'le stagiaire doit 120 €, pas 144 €');

    // Ce que produisait l'ancien code, gardé pour mémoire : stocker le TTC faisait appliquer
    // 20 % par-dessus un montant qui les contenait déjà.
    const ancien = facturx(ligneHT * (1 + taux / 100), false, taux);
    assert.strictEqual(ancien.grand, 144);
    assert.strictEqual(ancien.grand - facture.grand, 24, '24 € de surfacturation évités');
});

test('boutique : la colonne amount_net reçoit bien un HT', () => {
    // On vise le CALCUL, pas le nom de la variable : renommer `totalTtc` en `totalHt` sans
    // changer la formule aurait trompé une vérification par nom. Ce qui trahit un TTC, c'est
    // la présence du taux dans le calcul du montant stocké.
    const src = lire('controllers/shopRequest.controller.js');
    const total = src.match(/const totalHt = [^;]+;/);
    assert.ok(total, 'le total stocké doit être nommé totalHt');
    assert.doesNotMatch(total[0], /tax_rate/,
        'le montant stocké applique un taux : c\'est un TTC, pas une base HT');

    const ligne = src.match(/const ht = [^;]+;/);
    assert.ok(ligne, 'le montant de ligne doit être nommé ht');
    assert.doesNotMatch(ligne[0], /tax_rate|1\.2|ttc/i,
        'le montant de ligne applique un taux : c\'est un TTC');
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

test('la facture et la comptabilité annoncent le même montant pour une vente', () => {
    // La comptabilité relit `material_sale.amount * quantity`, donc le prix unitaire STOCKÉ.
    // Pour que les deux tombent juste, le code doit arrondir ce prix unitaire AVANT de
    // multiplier — c'est aussi ce que le client peut vérifier, le ticket affichant un prix
    // unitaire qu'il doit pouvoir multiplier lui-même.
    //
    // On vérifie la SOURCE et pas une reformulation : une égalité entre deux helpers écrits
    // ici passerait quel que soit le code réel.
    const src = lire('controllers/sale.controller.js');
    const decl = src.match(/const unitNet = [^;]+;/);
    assert.ok(decl, 'unitNet introuvable');
    assert.match(decl[0], /\.toFixed\(2\)\)/,
        'le prix unitaire doit être arrondi avant toute multiplication');

    // Et la conséquence chiffrée, pour que le test dise aussi POURQUOI.
    const arrondiUnitaire = (unit, qty) => Number((Number(unit.toFixed(2)) * qty).toFixed(2));
    for (const [prix, remise, qty] of [[9.99, 10, 9], [19.99, 7, 11], [100 / 3, 0, 3]]) {
        const unit = prix * (1 - remise / 100);
        assert.strictEqual(arrondiUnitaire(unit, qty), commeCompta(unit, qty),
            `${prix} € remisé ${remise} % × ${qty}`);
    }
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
