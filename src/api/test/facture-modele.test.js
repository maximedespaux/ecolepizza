/**
 * Le modèle de facture : ses jetons, et son tableau d'articles.
 *
 * DÉFAUT QUE CES TESTS EXISTENT POUR EMPÊCHER DE REVENIR. La première version passait à
 * `renderTemplateHtml` un objet maison `{ organisme, client, facture, lignes }`. Or celui-ci
 * appelle `resolveTokens(ctx)`, qui attend `{ org, learner, company, formations }`. Aucun des
 * 99 jetons standard ne trouvait sa valeur : une facture rendue depuis un modèle sortait avec
 * TOUS ses jetons vides. Le PDF était produit, l'erreur ne se voyait qu'en le lisant — et
 * seulement si le modèle avait un contenu, ce qui n'était pas le cas au moment du test.
 *
 * C'est le type de défaut qu'un test « ça répond 200 » ne peut pas attraper.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { renderTemplateHtml } = require('../lib/htmlfill.js');
const { resolveTokens, articleRowTokens, expandListBlocks } = require('../lib/tokens.js');

const ORG = { legal_name: 'ECOLE PIZZAIOLO', siret: '87995513600012',
    address: '101 rue Alsace Lorraine', zip_code: '65300', town: 'Lannemezan' };
const FACTURE = { number: 'F-2026-0013', typeLabel: 'Facture', dateFr: '21/07/2026',
    buyerName: 'Guillaume DESPAUX', buyerAddress: '12 rue des Fours, 33000 Bordeaux',
    totalHt: '29.82 €', totalTva: '4.22 €', totalTtc: '34.04 €',
    detailTva: '5.50 % sur 12.00 € : 0.66 € · 20.00 % sur 17.82 € : 3.56 €' };
const ARTICLES = [
    { name: 'Biberon valve 455 ml', qty: 2, unit_price_ht: 8.91, amount: 17.82, taxRate: 20 },
    { name: 'Farine T45', qty: 3, unit_price_ht: 4, amount: 12, taxRate: 5.5 },
];
const ctx = () => ({ org: ORG, company: {}, learner: { first_name: 'Guillaume DESPAUX' },
    formations: [], articles: ARTICLES, invoice: FACTURE });

const texte = (html) => html.slice(html.indexOf('<h1>')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('les jetons de l\'organisme se remplissent sur une facture', () => {
    // C'est précisément ce qui ne marchait pas : le contexte n'avait pas la forme attendue.
    const v = resolveTokens(ctx());
    assert.strictEqual(v['Organisme'], 'ECOLE PIZZAIOLO');
    assert.strictEqual(v['Siret organisme'], '87995513600012');
    assert.match(v['Adresse organisme'], /Lannemezan/);
});

test('les jetons propres à la facture se remplissent', () => {
    const v = resolveTokens(ctx());
    assert.strictEqual(v['Numéro facture'], 'F-2026-0013');
    assert.strictEqual(v['Acheteur'], 'Guillaume DESPAUX');
    assert.strictEqual(v['Total TTC'], '34.04 €');
    assert.match(v['Détail TVA'], /5\.50 %/);
});

test('un modèle rendu ne laisse aucun jeton vide', () => {
    const modele = '<h1>{Type facture} {Numéro facture}</h1><p>{Organisme} · {Siret organisme}</p>'
        + '<p>{Acheteur} — {Adresse acheteur}</p><p>{Total HT} / {Total TVA} / {Total TTC}</p>';
    const t = texte(renderTemplateHtml(modele, ctx(), { title: 'Facture' }));
    for (const attendu of ['Facture F-2026-0013', 'ECOLE PIZZAIOLO', '87995513600012',
        'Guillaume DESPAUX', '34.04 €']) {
        assert.ok(t.includes(attendu), `« ${attendu} » manquant dans : ${t.slice(0, 200)}`);
    }
});

test('le bloc {#Articles} produit une ligne par article', () => {
    const modele = '<h1>x</h1><table>{#Articles}<tr><td>{Désignation}</td><td>{Quantité}</td>'
        + '<td>{Prix unitaire HT}</td><td>{Montant HT}</td><td>{Taux TVA}</td><td>{Montant TTC}</td></tr>{/Articles}</table>';
    const t = texte(renderTemplateHtml(modele, ctx(), { title: 'Facture' }));
    assert.ok(t.includes('Biberon valve 455 ml'), 'premier article absent');
    assert.ok(t.includes('Farine T45'), 'second article absent');
    // Quantité, prix unitaire et TTC par ligne — ce que la facture doit montrer.
    assert.ok(t.includes('8.91 €'), 'prix unitaire absent');
    assert.ok(t.includes('21.38 €'), 'TTC de la ligne à 20 % absent');
    assert.ok(t.includes('12.66 €'), 'TTC de la ligne à 5,5 % absent');
});

test('chaque ligne porte SON taux, pas celui de la facture', () => {
    // Un panier mixte est le cas où une erreur de taux coûte de l'argent.
    const a = articleRowTokens(ARTICLES[0], 0);
    const b = articleRowTokens(ARTICLES[1], 1);
    assert.strictEqual(a['Taux TVA'], '20.00 %');
    assert.strictEqual(b['Taux TVA'], '5.50 %');
    assert.strictEqual(a['Montant TTC'], '21.38 €');
    assert.strictEqual(b['Montant TTC'], '12.66 €');
});

test('une quantité absente laisse une cellule vide, pas un chiffre inventé', () => {
    // Ligne de formation, ou facture antérieure à la migration 110 : mieux vaut un blanc franc
    // qu'un « 1 » qui aurait l'air d'une donnée sur une pièce comptable.
    const r = articleRowTokens({ name: 'Formation NIV2', amount: 850, taxRate: 0 }, 0);
    assert.strictEqual(r['Quantité'], '');
    assert.strictEqual(r['Prix unitaire HT'], '');
    assert.strictEqual(r['Montant HT'], '850.00 €');
});

test('un bloc sans article ne laisse pas le gabarit en clair', () => {
    const out = expandListBlocks('<p>{#Articles}<i>{Désignation}</i>{/Articles}</p>', 'Articles', [], articleRowTokens);
    assert.strictEqual(out, '<p></p>');
    assert.doesNotMatch(out, /Désignation/, 'le gabarit non développé apparaîtrait sur la facture');
});

test('les jetons de facture sont proposés dans la PALETTE de l\'éditeur', () => {
    // CE TEST VÉRIFIAIT LA MAUVAISE SOURCE. Il regardait TOKEN_CATALOG et passait au vert,
    // alors que la palette de l'éditeur ne lit PAS ce catalogue : elle se construit dans
    // `getTokens` à partir des Champs documents plus quelques groupes assemblés à la main.
    // Les jetons étaient donc résolvables mais INTROUVABLES — et un jeton qu'on ne peut pas
    // insérer n'existe pas pour la personne qui construit son modèle.
    //
    // On vise maintenant le contrôleur qui sert réellement la palette.
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');
    assert.match(src, /groups\.push\(factureTokensGroup\(\)\)/,
        'le groupe Facture n\'est pas ajouté à la palette');
    assert.match(src, /groups\.push\(articleTokensGroup\(\)\)/,
        'le groupe Ligne de facture n\'est pas ajouté à la palette');
    // Et leur place dans l'ordre des groupes, sinon ils tombent en fin de liste.
    assert.match(src, /'Organisme', 'Facture', 'Ligne de facture'/,
        'les groupes de facture doivent être rangés après Organisme');
});

test('les jetons de ligne proposés correspondent à ceux que le bloc remplit', () => {
    // Une palette qui propose un jeton que le rendu ne connaît pas produit une facture avec
    // « {Quantité} » imprimé en clair — le pire résultat possible sur une pièce client.
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');
    const bloc = src.slice(src.indexOf('function articleTokensGroup'));
    const proposes = [...bloc.slice(0, bloc.indexOf('\n}')).matchAll(/t\('([^']+)'/g)].map((m) => m[1]);
    const remplis = Object.keys(articleRowTokens({ name: 'x', qty: 1, unit_price_ht: 1, amount: 1, taxRate: 20 }, 0));
    for (const k of proposes) {
        assert.ok(remplis.includes(k), `« ${k} » est proposé dans la palette mais jamais rempli`);
    }
});
