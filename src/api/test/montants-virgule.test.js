/**
 * LES MONTANTS DE FACTURE S'ÉCRIVENT AVEC UNE VIRGULE (demandé le 2026-09-23).
 *
 * LE DÉFAUT. Les factures imprimaient « 17.82 € », avec un point — c'est ce que rend `toFixed(2)`,
 * et personne n'avait repris la chaîne derrière. La palette de jetons, elle, promettait déjà la
 * virgule dans ses exemples : l'écran annonçait une typographie que le document n'imprimait pas.
 * Le désaccord avait même été GELÉ par un test, qui exigeait le point pour que la palette dise au
 * moins la vérité — c'est cette moitié-là qui est corrigée aujourd'hui.
 *
 * CE QUE CES TESTS GARDENT SÉPARÉ, et qui est tout l'enjeu : trois lecteurs, trois formats.
 *   · LE PAPIER lit le français — virgule.
 *   · LA MACHINE lit le XML Factur-X — point, la norme EN 16931 l'impose. Une virgule y rendrait
 *     la facture illisible pour le logiciel qui la reçoit, ce à quoi sert précisément Factur-X.
 *   · LA BASE reçoit des décimaux SQL — point, sans quoi l'INSERT est refusé.
 * Le jour où quelqu'un « uniformisera » les trois, ces tests diront pourquoi il ne faut pas.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { montantFr, pourcentFr } = require('../lib/montants.js');
const { invoiceTokens, articleRowTokens } = require('../lib/tokens.js');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('un montant s\'écrit « 17,82 € » : virgule, deux décimales, toujours', () => {
    assert.strictEqual(montantFr(17.82), '17,82 €');
    /* DEUX DÉCIMALES MÊME SUR UN COMPTE ROND : dans une colonne, « 300 € » à côté de « 17,82 € »
       ne s'aligne plus sur la virgule, et un total sans décimale se lit comme un arrondi. */
    assert.strictEqual(montantFr(300), '300,00 €');
    assert.strictEqual(montantFr(0), '0,00 €');
    /* PAS DE SÉPARATEUR DE MILLIERS : une espace dans un nombre change la largeur de chaque
       colonne de chaque modèle, et les tableaux à hauteur réservée comptent leurs lignes. C'est
       une décision à part, qui se prendra sur un vrai PDF. */
    assert.strictEqual(montantFr(1500), '1500,00 €');
    /* UN MONTANT QUI S'ARRONDIT À ZÉRO N'A PAS DE SIGNE : « -0,00 € » sur une facture alarme
       pour rien, et laisse croire à un avoir. */
    assert.strictEqual(montantFr(-0.001), '0,00 €');
    /* JAMAIS « NaN € » : une valeur illisible laisse la case VIDE, ce qui se voit et se corrige. */
    assert.strictEqual(montantFr('douze'), '');
    assert.strictEqual(montantFr(undefined), '');
    /* La TVA s'écrit comme les montants qu'elle calcule, juste au-dessus. */
    assert.strictEqual(pourcentFr(20), '20,00 %');
    assert.strictEqual(pourcentFr(5.5), '5,50 %');
});

test('les jetons de facture impriment la virgule, du total à la ligne d\'article', () => {
    const t = invoiceTokens({
        number: 'F-1', totalHt: montantFr(17.82), totalTtc: montantFr(21.38),
        articles: [{ name: 'Biberon', qty: 2, unit_price_ht: 8.91, amount: 17.82, taxRate: 20 }],
    });
    assert.strictEqual(t['Total HT'], '17,82 €');
    assert.strictEqual(t['Total remise'], '0,00 €');

    const a = articleRowTokens({ name: 'Biberon', qty: 2, unit_price_ht: 8.91, amount: 17.82, taxRate: 20 }, 0);
    assert.strictEqual(a['Prix unitaire HT'], '8,91 €');
    assert.strictEqual(a['Montant HT'], '17,82 €');
    assert.strictEqual(a['Montant TTC'], '21,38 €');
    assert.strictEqual(a['Taux TVA'], '20,00 %');
    /* UNE CELLULE SANS VALEUR RESTE VIDE — elle ne devient pas « 0,00 € ». Une facture de
       formation n'a pas de prix unitaire ; un zéro s'y lirait comme un prix. */
    assert.strictEqual(articleRowTokens({ name: 'Formation', amount: 1500, taxRate: 0 }, 0)['Quantité'], '');
});

test('LE XML FACTUR-X GARDE LE POINT — la norme l\'exige, et la machine le lit', () => {
    /* Le seul format qui n'est pas un choix de typographie : EN 16931 / UN-CEFACT impose le point
       décimal. Une virgule y ferait rejeter la facture par le logiciel du client, sans que rien
       ne le signale de notre côté — le PDF, lui, s'afficherait très bien. */
    const X = lire('lib/facturx.js');
    assert.match(X, /const money = \(n\) => Number\(n \|\| 0\)\.toFixed\(2\);/,
        'le formateur du XML reste `toFixed(2)`, sans virgule');
    assert.ok(!/montants\.js/.test(X), 'et il n’emprunte PAS le format du papier');
    assert.ok(!/replace\('\.', ','\)/.test(X), 'aucune virgule décimale dans le XML');

    /* LA BASE AUSSI GARDE LE POINT : ces `toFixed(2)` sont des valeurs écrites en SQL, pas
       affichées. Une virgule y serait refusée à l'INSERT. */
    const C = lire('controllers/comptabilite.controller.js');
    assert.match(C, /amount\.toFixed\(2\)/);
    assert.ok(!/montants\.js/.test(C));
});

test('le format vit en UN seul endroit : plus aucun « toFixed(2) » suivi d\'un euro', () => {
    /* Cinq copies du même `(n) => ${n.toFixed(2)} €` traînaient dans deux fichiers. C'est ainsi
       que le désaccord avec la palette avait pu durer : corriger l'une ne corrigeait pas les
       autres, et rien ne disait lesquelles existaient. */
    for (const f of ['lib/tokens.js', 'controllers/invoice.controller.js']) {
        const s = lire(f);
        assert.ok(!/toFixed\(2\)\} €/.test(s), `${f} : un montant s’y formate encore à la main`);
        assert.ok(!/toFixed\(2\)\} %/.test(s), `${f} : un taux s’y formate encore à la main`);
        assert.match(s, /require\('\.?\.?\/?(lib\/)?montants\.js'\)/, `${f} : doit emprunter le format commun`);
    }
});
