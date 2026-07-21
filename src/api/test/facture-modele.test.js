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
const lireApi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

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

// --- Le tableau des articles, tel que l'ÉDITEUR le produit ---------------------------------

test('le bloc survit à la grammaire de l\'éditeur (marqueurs dans des cellules)', () => {
    // DÉFAUT CONSTATÉ DANS L'ÉDITEUR RÉEL, pas déduit. L'éditeur est un ProseMirror : sa
    // grammaire interdit du texte directement dans un <tbody>. Un gabarit « <tbody>{#Articles}
    // <tr>… » voit ses marqueurs REMONTÉS hors du tableau à l'insertion — ils atterrissent
    // dans un paragraphe au-dessus, et la ligne ne se répète jamais.
    //
    // Les marqueurs vivent donc dans des cellules, et c'est la LIGNE qui les contient qu'on
    // répète. On teste exactement le balisage que l'éditeur enregistre.
    const html = '<table><tbody><tr><th>Désignation</th><th>Qté</th><th>TTC</th></tr>'
        + '<tr><td>{#Articles}{Désignation}</td><td>{Quantité}</td><td>{Montant TTC}{/Articles}</td></tr>'
        + '</tbody></table>';
    const out = expandListBlocks(html, 'Articles', [
        { name: 'Biberon', qty: 2, unit_price_ht: 8.91, amount: 17.82, taxRate: 20 },
        { name: 'Farine', qty: 1, unit_price_ht: 24, amount: 24, taxRate: 5.5 },
    ], articleRowTokens);

    assert.strictEqual((out.match(/<tr/g) || []).length, 3, 'une ligne d\'en-tête + une par article');
    assert.doesNotMatch(out, /\{[#/]Articles\}/, 'les marqueurs doivent disparaître du rendu');
    assert.ok(out.includes('Biberon') && out.includes('Farine'), 'les deux articles doivent sortir');
    assert.ok(out.includes('21.38 €') && out.includes('25.32 €'), 'chaque ligne garde SON taux');
});

test('l\'en-tête du tableau ne se répète pas', () => {
    // L'erreur classique de ce genre de gabarit : englober l'en-tête dans le bloc.
    const html = '<table><tbody><tr><th>Désignation</th></tr>'
        + '<tr><td>{#Articles}{Désignation}{/Articles}</td></tr></tbody></table>';
    const out = expandListBlocks(html, 'Articles', [{ name: 'A', amount: 1 }, { name: 'B', amount: 1 }], articleRowTokens);
    assert.strictEqual((out.match(/Désignation<\/th>/g) || []).length, 1);
});

test('un tableau sans article ne laisse pas de ligne fantôme', () => {
    const html = '<table><tbody><tr><th>Désignation</th></tr>'
        + '<tr><td>{#Articles}{Désignation}{/Articles}</td></tr></tbody></table>';
    const out = expandListBlocks(html, 'Articles', [], articleRowTokens);
    assert.strictEqual((out.match(/<tr/g) || []).length, 1, 'seul l\'en-tête doit rester');
    assert.doesNotMatch(out, /Désignation<\/td>|\{/, 'ni gabarit ni marqueur en clair');
});

test('le gabarit inséré par l\'éditeur place les marqueurs dans des cellules', () => {
    // Si quelqu'un « corrige » le gabarit en remettant {#Articles} dans le <tbody>, la
    // fonctionnalité redevient silencieusement inopérante — sans erreur, juste un tableau vide.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/pages/TemplateEditor.jsx'), 'utf8');
    const bloc = src.slice(src.indexOf('const BLOC_ARTICLES'), src.indexOf('const BLOC_ARTICLES') + 700);
    assert.doesNotMatch(bloc, /<tbody>\{#Articles\}/, 'marqueur dans le tbody : il sera remonté hors du tableau');
    assert.match(bloc, /<td>\{#Articles\}/, 'le marqueur ouvrant doit être dans une cellule');
    assert.match(bloc, /\{\/Articles\}<\/td>/, 'le marqueur fermant doit être dans une cellule');
});

test('l\'aperçu du modèle montre des articles d\'exemple', () => {
    // Sans eux, un modèle de facture s'aperçoit avec un tableau vide : impossible de juger sa
    // mise en page, ce qui est pourtant tout l'objet d'un aperçu.
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');
    const bloc = src.slice(src.indexOf('const previewPdf'));
    const corps = bloc.slice(0, bloc.indexOf('\n};'));
    assert.match(corps, /articlesExemple/, 'l\'aperçu ne fournit aucun article');
    assert.match(corps, /taxRate: 5\.5/, 'deux taux différents, pour que le cas mixte se voie');
});

// --- {Articles} : une puce, un tableau ------------------------------------------------------

test('{Articles} produit un tableau complet, pas du texte', () => {
    // Réponse à un défaut d'ergonomie : la première version demandait d'insérer un bloc
    // {#Articles}…{/Articles} en TEXTE BRUT dans le document. On voyait des accolades au
    // milieu d'un modèle où tout le reste est une puce propre, et un retour à la ligne mal
    // placé cassait le bloc. Même principe que {Résultats}, qui existait déjà : une puce, un
    // tableau.
    const { articlesTable, RAW_TOKENS } = require('../lib/tokens.js');
    const html = articlesTable(ARTICLES);
    // On vise l'OUVERTURE d'un tableau, pas sa balise exacte : la première rédaction exigeait
    // `^<table>` littéralement et est tombée le jour où le tableau a reçu sa largeur. Un test
    // ne doit pas interdire un attribut dont il ne dit rien.
    assert.match(html, /^<table\b/, 'le jeton doit rendre un tableau');
    assert.strictEqual((html.match(/<tr/g) || []).length, 4, 'en-tête + un article par ligne + totaux');
    assert.ok(RAW_TOKENS.has('Articles'), 'sans RAW_TOKENS, le HTML sortirait échappé en clair');
});

test('la colonne TVA n\'apparaît que si les taux diffèrent', () => {
    // Sur une facture à taux unique, elle répète la même valeur à chaque ligne pour rien — et
    // le taux est déjà donné par {Détail TVA}.
    const { articlesTable } = require('../lib/tokens.js');
    const unique = articlesTable([ARTICLES[0]]);
    const mixte = articlesTable(ARTICLES);
    assert.doesNotMatch(unique, /<th>TVA<\/th>/, 'colonne inutile sur un taux unique');
    assert.match(mixte, /<th>TVA<\/th>/, 'colonne nécessaire dès que les taux diffèrent');
});

test('un tableau sans article ne laisse pas d\'en-tête orpheline', () => {
    const { articlesTable } = require('../lib/tokens.js');
    assert.strictEqual(articlesTable([]), '');
});

test('l\'aperçu rend {Articles} en tableau, pas en texte d\'exemple', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');
    const bloc = src.slice(src.indexOf('async function sampleTokenValues'));
    assert.match(bloc.slice(0, 900), /m\['Articles'\] = articlesTable\(/,
        "sans ça, l'aperçu afficherait le texte d'exemple au lieu d'une grille");
});

/*
 * LE MODÈLE DE FACTURE PRÊT À L'EMPLOI A ÉTÉ RETIRÉ à la demande de l'organisme, avec le bouton
 * « Facture type » qui le chargeait. Ses tests partent avec lui : ils ne décrivaient plus rien.
 *
 * Le test qui suit, LUI, RESTE. Il ne portait pas sur le modèle type mais sur un défaut que sa
 * mise au point avait révélé, et qui touche toutes les factures quel que soit le modèle employé.
 */

test('les jetons « Champs documents » se remplissent sur une facture', () => {
    // DÉFAUT TROUVÉ EN RENDANT LE MODÈLE, pas en le lisant. `fillHtml` remplit les jetons
    // field:… depuis `ctx.fields` ; le contexte facture ne le peuplait pas. TOUS les champs de
    // la palette « Organisme » sortaient donc VIDES — raison sociale, SIRET, NDA, IBAN — alors
    // qu'ils sont proposés à l'insertion. Un jeton qu'on peut poser et qui ne se remplit jamais
    // est pire que pas de jeton du tout.
    const src = lireApi('controllers/invoice.controller.js');
    const bloc = src.slice(src.indexOf('function invoiceCtx'));
    const corps = bloc.slice(0, bloc.indexOf('\n}\n'));
    assert.match(corps, /fields\[`organization\.\$\{k\}`\]/, 'ctx.fields n\'est pas peuplé');
    assert.match(corps, /^\s+fields,$/m, 'ctx.fields n\'est pas transmis');
});

test('l\'éditeur ne référence plus le modèle type retiré', () => {
    // Un import mort ne casse rien tant que le fichier existe ; le jour où on supprime ce
    // dernier, l'écran entier tombe en erreur au chargement. On vérifie donc que le retrait est
    // complet, pas seulement que le bouton a disparu de l'écran.
    const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/pages/TemplateEditor.jsx'), 'utf8');
    assert.doesNotMatch(ui, /modeleFacture|MODELE_FACTURE/, 'référence résiduelle au modèle type');
});

// --- La largeur des tableaux dans le PDF -----------------------------------------------------

test('les tableaux portent la largeur en ATTRIBUT, pas seulement en CSS', () => {
    // LIBREOFFICE IGNORE `width: 100%` EN CSS SUR UN TABLEAU. La feuille de style le déclarait
    // depuis toujours et le PDF sortait des tableaux serrés sur la moitié gauche de la page.
    // La règle CSS n'était pas fausse : elle n'était jamais lue. Constaté en rendant les deux
    // formes côte à côte — impossible à voir en relisant le code, c'est une propriété du
    // moteur de conversion.
    const { renderTemplateHtml } = require('../lib/htmlfill.js');
    const html = renderTemplateHtml('<table><tbody><tr><td>a</td></tr></tbody></table>',
        { org: {} }, { letterhead: false });
    assert.match(html, /<table[^>]*\swidth="100%"/, 'largeur absente de l\'attribut');
});

test('une largeur choisie par l\'organisme n\'est pas écrasée', () => {
    // La valeur par défaut ne doit pas défaire un choix explicite.
    const { renderTemplateHtml } = require('../lib/htmlfill.js');
    for (const t of ['<table width="40%"><tbody><tr><td>a</td></tr></tbody></table>',
        '<table style="width:8cm"><tbody><tr><td>a</td></tr></tbody></table>']) {
        const html = renderTemplateHtml(t, { org: {} }, { letterhead: false });
        assert.doesNotMatch(html, /width="100%"/, `largeur écrasée : ${t}`);
    }
});

test('le tableau des articles fixe ses largeurs de colonnes', () => {
    // Sans colgroup, LibreOffice répartit à parts égales : la désignation passait sur deux
    // lignes pendant que « Qté » — trois caractères — prenait autant de place, au point de se
    // couper en « Q / té ».
    const { articlesTable } = require('../lib/tokens.js');
    const uni = articlesTable([{ name: 'Farine', qty: 1, unit_price_ht: 10, amount: 10, taxRate: 20 }]);
    const mixte = articlesTable([
        { name: 'Farine', qty: 1, unit_price_ht: 10, amount: 10, taxRate: 5.5 },
        { name: 'Pelle', qty: 1, unit_price_ht: 10, amount: 10, taxRate: 20 },
    ]);
    for (const [t, colonnes] of [[uni, 5], [mixte, 6]]) {
        const cols = [...t.matchAll(/<col width="(\d+)%">/g)].map((m) => Number(m[1]));
        assert.strictEqual(cols.length, colonnes, 'une largeur par colonne');
        assert.strictEqual(cols.reduce((a, b) => a + b, 0), 100, `les largeurs font ${cols.reduce((a, b) => a + b, 0)} %`);
        // La désignation est le seul champ de longueur variable : elle doit dominer.
        assert.ok(cols[0] >= 40, `désignation trop étroite (${cols[0]} %)`);
    }
});

// --- La ligne de totaux ----------------------------------------------------------------------

const { articlesTable } = require('../lib/tokens.js');
/** Les cellules d'un tableau, dans l'ordre, débarrassées de leur mise en forme. */
const cellules = (html) => [...html.matchAll(/<t[dh]>([\s\S]*?)<\/t[dh]>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim());

test('le tableau des articles se termine par une ligne de totaux', () => {
    const t = articlesTable(ARTICLES);
    const c = cellules(t);
    const i = c.lastIndexOf('Total');
    assert.ok(i > 0, 'aucune ligne de totaux');
    // Quantité, HT et TTC totalisés ; le prix unitaire ne l'est pas — additionner des prix
    // unitaires ne produirait aucune grandeur ayant un sens.
    assert.strictEqual(c[i + 1], '5', '2 + 3 articles');
    assert.strictEqual(c[i + 2], '', 'les prix unitaires ne s\'additionnent pas');
    assert.strictEqual(c[i + 3], '29.82 €');
});

test('LE TOTAL EST LA SOMME DE CE QUI EST IMPRIMÉ, pas des valeurs brutes', () => {
    // LE POINT DÉLICAT. Les montants de ligne sont arrondis au centime pour l'affichage.
    // Additionner les valeurs d'origine donnerait un total qui ne correspond PAS à la colonne
    // au-dessus : un client qui vérifie à la calculette trouverait un centime d'écart, et
    // aurait raison de le signaler. Sur une pièce comptable, un total qui ne tombe pas juste
    // met en doute tout le reste.
    //
    // Cas construit pour ça : 54,999 + 64,905 = 119,904, soit 119,90 € en sommant les valeurs
    // brutes — mais la colonne affiche 55,00 € et 64,91 €, dont la somme est 119,91 €.
    const t = articlesTable([
        { name: 'Farine T65', qty: 3, unit_price_ht: 18.333, amount: 54.999, taxRate: 5.5 },
        { name: 'Pelle inox', qty: 1, unit_price_ht: 64.905, amount: 64.905, taxRate: 20 },
    ]);
    const c = cellules(t);
    const i = c.lastIndexOf('Total');
    const ht = c.slice(0, i).filter((_, k) => k >= 6).filter((v) => /€$/.test(v));
    assert.ok(c.includes('55.00 €') && c.includes('64.91 €'), 'colonne HT attendue');
    assert.strictEqual(c[i + 3], '119.91 €', 'le total doit suivre la colonne, pas les valeurs brutes');
    assert.notStrictEqual(c[i + 3], '119.90 €', 'somme des valeurs brutes : ne correspondrait pas à l\'affichage');
    void ht;
    // Même exigence sur le TTC : 58,02 + 77,89.
    assert.strictEqual(c[i + 5], '135.91 €');
});

test('la colonne TVA reste vide dans les totaux', () => {
    // Additionner 5,5 % et 20 % ne veut rien dire, et un taux moyen serait une information
    // fausse. La ventilation par taux est donnée ailleurs, par {Détail TVA}.
    const c = cellules(articlesTable(ARTICLES));
    const i = c.lastIndexOf('Total');
    assert.strictEqual(c[i + 4], '', 'un taux totalisé serait faux');
});

test('sans quantités, la case des quantités totales reste vide', () => {
    // Une facture de formation n'a pas de quantités : un « 0 » ressemblerait à une donnée
    // alors que c'est une absence.
    const c = cellules(articlesTable([
        { name: 'Formation NIV2', amount: 850, taxRate: 0 },
        { name: 'Formation NIV3', amount: 950, taxRate: 0 },
    ]));
    const i = c.lastIndexOf('Total');
    assert.strictEqual(c[i + 1], '');
    assert.strictEqual(c[i + 3], '1800.00 €', 'le HT reste totalisé');
});

test('la ligne de totaux a autant de cellules que l\'en-tête', () => {
    // Une cellule de moins et LibreOffice décale toute la ligne : le total HT s'afficherait
    // sous « P.U. HT ». On vérifie donc les deux formes, avec et sans colonne TVA.
    for (const rows of [ARTICLES, [ARTICLES[0]]]) {
        const t = articlesTable(rows);
        const lignes = t.split('<tr>').slice(1);
        const compte = (l) => (l.match(/<t[dh]\b/g) || []).length;
        assert.strictEqual(compte(lignes[lignes.length - 1]), compte(lignes[0]),
            'la ligne de totaux n\'a pas le même nombre de colonnes que l\'en-tête');
    }
});
