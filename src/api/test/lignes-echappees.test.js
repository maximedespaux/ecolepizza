/**
 * LES VALEURS D'UNE LIGNE ({#Articles}, {#Paiements}) SONT DU TEXTE — relevé le 2026-09-30.
 *
 * LE DÉFAUT. `remplirLigne` (lib/tokens.js), qui remplit chaque ligne des blocs {#Articles} et
 * {#Paiements}, insérait les valeurs TELLES QUELLES dans le HTML du document. Les jetons simples
 * s'échappent (`escapeHtml`, htmlfill.js), les tableaux {Articles} et {Règlements} aussi, les blocs
 * {#Stagiaires} aussi (`escCell`) ; les lignes, non. Un « < » ou un « & » dans une désignation ou
 * dans la banque d'un chèque devenait donc du balisage. Et la désignation d'une facture de la
 * boutique reprend la PERSONNALISATION que le stagiaire tape dans son panier (espace.controller.js,
 * puis invoiceShopRequest : « Tablier × 1 — <ce qu'il a tapé> ») : une balise écrite là entrait dans
 * le HTML que LibreOffice met en page pour l'école.
 *
 * LE SECOND DÉFAUT, SUR LA MÊME LIGNE DE CODE. La valeur d'une PUCE s'insérait en chaîne de
 * remplacement, où `replace` lit `$&`, `$'`, `$$` : « Lot $& promo » réinsérait la puce, et « $' »
 * recopiait la fin de la ligne — `</td></tr>` compris, le tableau sortait cassé.
 *
 * Ce fichier gèle :
 *   · l'échappement des deux formes de jeton (puce, {Clé}) et des deux formes de bloc (une ligne de
 *     tableau par article ; le tableau « à hauteur réservée » qui les empile dans la cellule) ;
 *   · la banque et le numéro d'un chèque, dans {#Paiements} ;
 *   · les motifs « $ » imprimés tels qu'on les a tapés, la ligne entière ;
 *   · de bout en bout, par le contexte et le rendu de la facture : l'échappement survit à la passe
 *     globale, n'est pas fait deux fois, et donne le texte même du tableau {Articles}.
 *
 * NE GÈLE PAS : un {Clé} écrit en toutes lettres dans une valeur (« Tablier {Règlement} ») est encore
 * remplacé par la passe globale de `fillHtml`, qui relit tout le texte inséré — celui des jetons
 * simples aussi. Ce n'est pas l'affaire d'une ligne.
 *
 * Chaque test a été vu ROUGE en réintroduisant le défaut qu'il gèle.
 */
const test = require('node:test');
const assert = require('node:assert');

const { expandListBlocks, articleRowTokens, paiementRowTokens } = require('../lib/tokens.js');
const { renderTemplateHtml } = require('../lib/htmlfill.js');
const { invoiceCtx } = require('../controllers/invoice.controller.js');

/** Une puce, telle que l'éditeur l'écrit. */
const puce = (k) => `<span data-token="${k}">${k}</span>`;
/** Le bloc ENJAMBE la ligne, comme dans les vrais modèles : ouvert dans la première cellule, fermé
 *  dans la dernière (cf. CLAUDE.md § 5). */
const LIGNE_ARTICLES = `<table><tbody><tr><td>{#Articles}${puce('Désignation')}</td><td>${puce('Montant HT')}{/Articles}</td></tr></tbody></table>`;

/** La désignation qu'écrit invoiceShopRequest, la personnalisation du stagiaire au bout. */
const PERSO = 'Tablier × 1 — <img src="http://exemple.invalid/p.png"> & <b>Jean</b>';
const PERSO_TEXTE = 'Tablier × 1 — &lt;img src="http://exemple.invalid/p.png"&gt; &amp; &lt;b&gt;Jean&lt;/b&gt;';
/** Les balises tapées : aucune ne doit se retrouver dans le document. */
const baliseTapee = (html) => /<img src="http:\/\/exemple\.invalid|<b>Jean<\/b>|<i>Agricole<\/i>/.exec(html);

test('UNE DÉSIGNATION EST DU TEXTE — la personnalisation du stagiaire n\'entre pas dans le HTML, en puce comme en {Clé}', () => {
    const out = expandListBlocks(LIGNE_ARTICLES, 'Articles', [{ name: PERSO, amount: 50 }], articleRowTokens);
    assert.strictEqual(baliseTapee(out), null, `une balise tapée par le stagiaire est entrée dans le document : ${out}`);
    assert.strictEqual(out, `<table><tbody><tr><td>${PERSO_TEXTE}</td><td>50,00 €</td></tr></tbody></table>`);

    // La forme {Clé}, des modèles venus de Word : même règle.
    const texte = expandListBlocks('<p>{#Articles}{Désignation}<br>{/Articles}</p>', 'Articles', [{ name: PERSO, amount: 50 }], articleRowTokens);
    assert.strictEqual(texte, `<p>${PERSO_TEXTE}<br></p>`);
});

test('LA BANQUE ET LE NUMÉRO D\'UN CHÈQUE SONT DU TEXTE — dans {#Paiements}', () => {
    const modele = `<table><tbody><tr><td>{#Paiements}${puce('Moyen')}</td><td>${puce('Banque')}</td><td>${puce('N° chèque')}{/Paiements}</td></tr></tbody></table>`;
    const out = expandListBlocks(modele, 'Paiements',
        [{ method: 'Chèque', amount: 60, bank: 'Crédit <i>Agricole</i> & fils', cheque_number: '<0012345>' }], paiementRowTokens);
    assert.strictEqual(out, '<table><tbody><tr><td>Chèque</td><td>Crédit &lt;i&gt;Agricole&lt;/i&gt; &amp; fils</td>'
        + '<td>&lt;0012345&gt;</td></tr></tbody></table>');
});

test('LE TABLEAU « À HAUTEUR RÉSERVÉE » AUSSI — les articles empilés dans la cellule', () => {
    /* L'autre chemin vers `remplirLigne` (`empilerDansLaLigne`) : c'est celui de `facture-stagiaire`,
       dont le tableau garde une seule ligne et empile les articles, séparés par des <br>. */
    const out = expandListBlocks(LIGNE_ARTICLES, 'Articles',
        [{ name: PERSO, amount: 50 }, { name: 'Pelle & fourche', amount: 10 }], articleRowTokens, { inline: true, minLines: 3 });
    assert.strictEqual(baliseTapee(out), null, out);
    assert.strictEqual(out, `<table><tbody><tr><td>${PERSO_TEXTE}<br>Pelle &amp; fourche<br>&nbsp;</td>`
        + '<td>50,00 €<br>10,00 €<br>&nbsp;</td></tr></tbody></table>');
});

test('LES MOTIFS « $ » S\'IMPRIMENT TELS QU\'ON LES A TAPÉS — et la ligne reste entière', () => {
    /* En chaîne de remplacement, `replace` les interprète : « $& » est la puce elle-même, « $' » ce qui
       la suit — ici `</td><td>{Montant HT}</td></tr>`, recopié dans la cellule —, « $` » ce qui la
       précède, « $$ » un seul « $ ». */
    for (const [tape, imprime] of [
        ['Lot $& promo', 'Lot $&amp; promo'],
        ['Lot $$ promo', 'Lot $$ promo'],
        ['Fin $\' ici', 'Fin $\' ici'],
        ['Début $` ici', 'Début $` ici'],
    ]) {
        const out = expandListBlocks(LIGNE_ARTICLES, 'Articles', [{ name: tape, amount: 10 }], articleRowTokens);
        assert.strictEqual(out, `<table><tbody><tr><td>${imprime}</td><td>10,00 €</td></tr></tbody></table>`, tape);
    }
});

test('DE BOUT EN BOUT — la facture rendue imprime la personnalisation en texte, échappée une fois, comme le tableau {Articles}', () => {
    // Le contexte du PDF (`invoiceCtx`), sur une facture telle que `loadInvoiceData` la relit.
    const ctx = invoiceCtx({ legal_name: 'École' }, {
        number: 'BQ-2026-0001', typeLabel: 'Facture', issueDate: '20260930',
        amountNet: '50.00', tvaExoneree: false, taxRate: 20,
        lines: [{ name: PERSO, amount: 50, taxRate: 20, qty: 1, unit_price_ht: 50 }],
        buyer: { name: 'Jean Martin', address: {} },
        paymentMethod: 'Chèque',
        paymentSplit: JSON.stringify([{ method: 'Chèque', amount: 60, bank: 'Crédit <i>Agricole</i> & fils', cheque_number: '0012345' }]),
    });
    // Les trois façons d'imprimer ces valeurs dans un modèle : blocs (ici « à hauteur réservée ») et tableau.
    const modele = `<table data-rows="inline" data-minlines="4"><tbody><tr><td>{#Articles}${puce('Désignation')}</td>`
        + `<td>${puce('Montant HT')}{/Articles}</td></tr></tbody></table>`
        + `<table><tbody><tr><td>{#Paiements}${puce('Moyen')}</td><td>${puce('Banque')}{/Paiements}</td></tr></tbody></table>`
        + `<div>${puce('Articles')}</div>`;
    const html = renderTemplateHtml(modele, ctx, { title: 'Facture BQ-2026-0001', letterhead: false });
    const corps = html.slice(html.indexOf('<body'));

    assert.strictEqual(baliseTapee(corps), null, 'une balise tapée est entrée dans la facture');
    assert.ok(!/&amp;(amp|lt|gt);/.test(corps), 'la passe globale ne doit pas échapper une seconde fois');
    // Le même texte, au caractère près, dans le bloc {#Articles} et dans le tableau {Articles}.
    assert.strictEqual(corps.split(PERSO_TEXTE).length - 1, 2, `la désignation, dans le bloc ET dans le tableau : ${corps}`);
    assert.ok(corps.includes('Crédit &lt;i&gt;Agricole&lt;/i&gt; &amp; fils'), 'la banque, dans {#Paiements}');
});
