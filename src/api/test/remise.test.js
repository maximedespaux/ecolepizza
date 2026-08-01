/**
 * La remise : exclusive, affichable, et totalisable en euros.
 *
 * TROIS DÉFAUTS GELÉS ICI.
 *
 * 1. LES DEUX REMISES SE CUMULAIENT. `sale.controller.js` multipliait (1 − remise ligne) par
 *    (1 − remise globale) : 10 % sur l'article et 5 % sur la vente faisaient 14,5 %. Personne ne
 *    lit une facture ainsi — on y voit un taux à côté d'un prix et on attend que l'un donne
 *    l'autre. Elles s'excluent désormais : soit ligne par ligne, soit un taux unique.
 *
 * 2. LA REMISE N'ÉTAIT ÉCRITE NULLE PART. Elle était fondue dans le prix net, et sa seule trace
 *    était du texte collé au libellé (« Biberon valve (remise 10%) »). Aucun jeton ne pouvait la
 *    montrer, et le total des remises était introuvable autrement qu'en relisant des chaînes.
 *
 * 3. LES EUROS DOIVENT VENIR DE LA SOUSTRACTION, pas du taux. Repasser par le taux
 *    (net ÷ (1 − taux)) rend une troisième décimale et fait diverger le total des remises de la
 *    somme des lignes — la dérive au centime que sale.controller.js documente avoir déjà payée.
 *
 * `articleRowTokens` et `articlesTable` sont PURES : on les importe et on les exécute. La règle
 * d'exclusion vit dans une route Express, donc elle se vérifie sur le SOURCE (cf. CLAUDE.md § 2.5).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { articleRowTokens, articlesTable, invoiceTokens } = require('../lib/tokens.js');

const API = path.join(__dirname, '..');
const srcSale = fs.readFileSync(path.join(API, 'controllers/sale.controller.js'), 'utf8');
const srcVentes = fs.readFileSync(path.join(API, '..', 'app/ui/pages/Ventes.jsx'), 'utf8');

/** Ligne de facture telle que l'invoiceCtx la fabrique. */
const ligne = (extra = {}) => ({
    name: 'Biberon valve 455 ml', qty: 2, unit_price_ht: 8.91, amount: 17.82, taxRate: 20, ...extra,
});
/** Ligne remisée à 10 % : 9,90 € brut → 8,91 € net. */
const remisee = (extra = {}) => ligne({ discount_pct: 10, unit_price_gross_ht: 9.9, ...extra });

test('un article remisé affiche son taux', () => {
    assert.strictEqual(articleRowTokens(remisee(), 0)['Remise'], '10 %');
});

test('un article sans remise affiche un tiret, jamais une case vide', () => {
    // Une case vide se lit comme une colonne oubliée ; le tiret dit « on a regardé ».
    assert.strictEqual(articleRowTokens(ligne({ discount_pct: 0 }), 0)['Remise'], '—');
});

test('une facture émise AVANT la migration 122 affiche aussi un tiret', () => {
    // discount_pct absent : l'information n'a jamais été enregistrée. Ne rien inventer.
    assert.strictEqual(articleRowTokens(ligne(), 0)['Remise'], '—');
});

test('un taux entier s\'écrit sans décimales, un taux fractionnaire les garde', () => {
    assert.strictEqual(articleRowTokens(remisee({ discount_pct: 10 }), 0)['Remise'], '10 %');
    assert.strictEqual(articleRowTokens(remisee({ discount_pct: 7.5 }), 0)['Remise'], '7,50 %');
});

test('le total des remises est la SOUSTRACTION brut − net', () => {
    // 9,90 − 8,91 = 0,99 € par unité, × 2 = 1,98 €.
    const t = invoiceTokens({ number: 'F-1', articles: [remisee()] });
    assert.strictEqual(t['Total remise'], '1.98 €');
});

test('… et PAS un calcul depuis le taux, qui dérive d\'un centime', () => {
    /* Le cas qui sépare vraiment les deux méthodes — celui du commentaire de sale.controller.js.
     *
     * 9,99 € remisé 10 % : le prix unitaire net est arrondi À 8,99 (8,991 exactement). Sur neuf
     * articles :
     *   par soustraction     (9,99 − 8,99) × 9 = 1,00 × 9 = 9,00 €   ← ce qu'on veut
     *   en repassant par le taux  8,99 ÷ 0,9 × 0,1 × 9 = 0,99888… × 9 = 8,99 €
     * Un centime, mais toujours dans le même sens, et le total des remises ne tombe alors plus
     * sur la différence entre le total brut et le total facturé.
     *
     * Le premier jeu de chiffres (9,90 → 8,91) ne le montrait PAS : la division y est exacte,
     * les deux méthodes donnent 1,98 €. Un test peut avoir l'air de geler une règle sans rien
     * prouver — celui-ci a été vérifié en réintroduisant le défaut. */
    const t = invoiceTokens({
        number: 'F-1',
        articles: [ligne({ qty: 9, unit_price_ht: 8.99, discount_pct: 10, unit_price_gross_ht: 9.99 })],
    });
    assert.strictEqual(t['Total remise'], '9.00 €');
});

test('le total additionne toutes les lignes remisées', () => {
    const t = invoiceTokens({
        number: 'F-1',
        articles: [remisee(), remisee({ qty: 1 }), ligne()], // 1,98 + 0,99 + 0 (non remisée)
    });
    assert.strictEqual(t['Total remise'], '2.97 €');
});

test('sans aucune remise, le total vaut 0 € — et non une chaîne vide', () => {
    // Un modèle qui réserve une ligne « Remise » doit afficher un montant, pas un trou.
    const t = invoiceTokens({ number: 'F-1', articles: [ligne(), ligne()] });
    assert.strictEqual(t['Total remise'], '0.00 €');
});

test('une facture d\'avant la 122 ne fabrique pas de remise', () => {
    const t = invoiceTokens({ number: 'F-1', articles: [ligne(), ligne()] });
    assert.strictEqual(t['Total remise'], '0.00 €');
});

test('le tableau {Articles} montre la colonne Remise SEULEMENT si elle a du contenu', () => {
    // Même règle que la colonne TVA : une colonne de tirets vole de la largeur à la désignation.
    assert.match(articlesTable([remisee()]), /<th>Remise<\/th>/);
    assert.doesNotMatch(articlesTable([ligne()]), /<th>Remise<\/th>/);
});

test('le tableau garde des colonnes cohérentes quand la Remise apparaît', () => {
    // Une largeur oubliée décale toute la ligne de totaux sous les mauvaises colonnes.
    const html = articlesTable([remisee(), remisee({ taxRate: 5.5 })]); // remise ET taux mixtes
    const largeurs = [...html.matchAll(/<col width="([\d.]+)%">/g)].map((m) => Number(m[1]));
    const enTetes = (html.match(/<th>/g) || []).length;
    const cellulesTotal = (/<tr><td><strong>Total<\/strong>[\s\S]*?<\/tr>/.exec(html)[0].match(/<td/g) || []).length;
    assert.strictEqual(largeurs.length, enTetes, 'une largeur par colonne');
    assert.strictEqual(cellulesTotal, enTetes, 'la ligne de totaux doit avoir autant de cases que d\'en-têtes');
    assert.strictEqual(largeurs.reduce((a, b) => a + b, 0), 100, 'les largeurs doivent sommer à 100 %');
});

test('le serveur REFUSE une vente qui cumule remise de ligne et remise globale', () => {
    // La caisse désactive l'un dès que l'autre est saisi, mais un front en cache ou une requête
    // postée à la main passerait outre : la vente s'enregistrerait à un montant non voulu.
    assert.match(srcSale, /remiseDeLigne\s*&&\s*globalDisc\s*>\s*0/,
        'le contrôleur doit détecter le cumul');
    assert.match(srcSale, /422[\s\S]{0,300}remise globale/i,
        'le cumul doit être refusé, pas arbitré en silence');
});

test('le prix net ne multiplie plus deux facteurs de remise', () => {
    // Le défaut d'origine, dans sa forme exacte.
    assert.doesNotMatch(srcSale, /1 - ln\._disc \/ 100\) \* factor/,
        'les deux remises ne doivent plus se multiplier');
    assert.match(srcSale, /const taux = tauxDe\(ln\)/, 'un seul taux doit s\'appliquer par ligne');
});

test('la remise est figée sur la ligne de facture, taux ET prix brut', () => {
    assert.match(srcSale, /discount_pct',\s*'unit_price_gross_ht'/,
        'les deux colonnes doivent être écrites (cf. migration 122)');
    assert.match(srcSale, /hasColumn\(conn, 'invoice_line', 'discount_pct'\)/,
        'colonne optionnelle : le code doit marcher avant ET après la migration');
});

test('la caisse applique la même règle d\'exclusion que le serveur', () => {
    // Sinon elle afficherait un total que le serveur refuserait d'encaisser.
    assert.match(srcVentes, /remiseDeLigne/, 'la caisse doit connaître le mode « remise de ligne »');
    assert.match(srcVentes, /disabled=\{remiseDeLigne\}/, 'la remise globale doit se désactiver');
    assert.match(srcVentes, /disabled=\{remiseGlobale > 0\}/, 'les remises de ligne doivent se désactiver');
    assert.match(srcVentes, /discount: remiseDeLigne \? 0 : remiseGlobale/,
        'la caisse ne doit jamais envoyer les deux remises');
});
