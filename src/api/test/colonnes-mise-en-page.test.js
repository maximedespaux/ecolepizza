/**
 * Le bloc « deux colonnes » de l'éditeur, tel qu'il DOIT sortir au PDF.
 *
 * L'éditeur écrit des <div data-cols> / <div data-col> (flex, pour l'écran). Le rendu serveur
 * les convertit en colonnes FLOTTANTES (float:left) — et non en tableau de mise en page.
 *
 * POURQUOI FLOAT ET PAS UN TABLEAU (le défaut que ces tests gèlent). Le premier jet posait une
 * cellule par colonne. LibreOffice place alors mal un TABLEAU imbriqué dans la DERNIÈRE cellule
 * quand la cellule voisine fait plusieurs lignes : le tableau des totaux « retombe » SOUS la
 * colonne au lieu de rester à côté (reproduit au rendu, colgroup et table-layout:fixed n'y
 * changeaient rien). Les colonnes flottantes tiennent côte à côte quel que soit le côté du
 * tableau — c'est ce que ces tests vérifient.
 */
const test = require('node:test');
const assert = require('node:assert');
const { renderBodyOnlyDoc } = require('../lib/htmlfill.js');

const org = { legal_name: 'X' };
const render = (body) => renderBodyOnlyDoc(body, { org }, {});
const COLS = (a, b, wa, wb) =>
    '<div data-cols class="doc-cols">'
    + `<div data-col class="doc-col"${wa ? ` data-w="${wa}"` : ''}>${a}</div>`
    + `<div data-col class="doc-col"${wb ? ` data-w="${wb}"` : ''}>${b}</div>`
    + '</div>';

test('un bloc colonnes devient une rangée de colonnes flottantes', () => {
    const html = render(COLS('<p>Gauche</p>', '<p>Droite</p>'));
    assert.match(html, /class="cols-row"[^>]*overflow:hidden/, 'rangée englobante attendue');
    assert.strictEqual((html.match(/class="col-box"/g) || []).length, 2, 'une boîte flottante par colonne');
    assert.match(html, /col-box"[^>]*float:left/);
    // Le flux normal est relancé après la rangée (le contenu suivant passe dessous, pas à côté).
    assert.match(html, /clear:both/);
    assert.ok(html.indexOf('Gauche') < html.indexOf('Droite'), 'ordre des colonnes conservé');
});

test('les largeurs de colonnes (data-w) deviennent la largeur des boîtes', () => {
    const html = render(COLS('<p>a</p>', '<p>b</p>', '60', '40'));
    assert.match(html, /col-box"[^>]*width:60%/);
    assert.match(html, /col-box"[^>]*width:40%/);
});

test('sans largeur donnée, les colonnes se partagent l\'espace (≤ 100 % au total)', () => {
    const html = render(COLS('<p>a</p>', '<p>b</p>'));
    assert.strictEqual((html.match(/col-box"[^>]*width:50%/g) || []).length, 2);
});

test('un TABLEAU dans une colonne garde ses bordures et prend toute la colonne', () => {
    // LE CŒUR DE LA FONCTION : totaux (tableau bordé) d'un côté, texte de l'autre.
    const totaux = '<table data-border="solid" data-width="full"><tbody>'
        + '<tr><td>Total TTC</td><td>144,00</td></tr></tbody></table>';
    const html = render(COLS('<p>Conditions de règlement</p>', totaux, '58', '42'));
    // Le tableau des totaux vit DANS la boîte flottante de droite (après la boîte de gauche).
    assert.ok(html.indexOf('col-box') < html.indexOf('Total TTC'));
    // Bordure pleine INLINE sur ses cellules (LibreOffice ignore le CSS des bordures).
    assert.match(html, /border:1px solid #999;/, 'le tableau interne doit garder sa bordure');
    // Il est forcé à 100 % de SA colonne (la boîte flottante le borne à 42 %).
    assert.match(html, /data-width="full" width="100%"/, 'le tableau interne doit être forcé à 100% de sa colonne');
});

test('un tableau « half » dans une colonne reste compact et aligné à droite', () => {
    const totaux = '<table data-border="solid" data-width="half"><tbody>'
        + '<tr><td>TTC</td><td>144</td></tr></tbody></table>';
    const html = render(COLS('<p>terms</p>', totaux));
    assert.match(html, /align="right" width="45%"/, 'le mode half doit survivre à la conversion en colonnes');
});

test('RÉGRESSION : un tableau seul (hors colonnes) garde son comportement pleine largeur', () => {
    // Le traitement des tableaux sûr à l'imbrication ne doit RIEN changer au cas simple.
    const html = render('<table data-width="full"><tbody><tr><td>Qté</td><td>PU</td></tr></tbody></table>');
    assert.match(html, /width="100%"/);
    assert.match(html, /border:1px solid #999;/);
    assert.doesNotMatch(html, /cols-row/, 'aucune rangée de colonnes ne doit apparaître');
});
