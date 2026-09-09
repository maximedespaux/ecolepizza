/**
 * LE BOUTON DE PROFIL, EN BAS DE LA BARRE LATÉRALE, SUR IPAD ET IPHONE.
 *
 * LE DÉFAUT, constaté en photo sur iPad : barre d'adresse Safari DÉPLOYÉE, le bouton
 * « Guillaume Despaux · Super administrateur » était coupé par le bas de l'écran ; barre
 * rétractée, il réapparaissait entier. Deux captures au même endroit, à une minute d'écart.
 *
 * LA CAUSE N'EST PAS LE DÉFILEMENT — `nav.menu` défile déjà (`flex:1;overflow-y:auto`). C'est le
 * CONTENEUR qui dépassait : `height:100vh`. Sur iOS, `100vh` vaut la hauteur du viewport SANS la
 * barre d'adresse, celle qu'on obtient une fois la page défilée. Barre déployée, la zone
 * réellement visible est plus courte d'environ quatre-vingt-dix pixels, et le dernier enfant de
 * la colonne — le pied — se retrouve physiquement sous l'écran. Rien ne le signale : ni
 * débordement, ni barre de défilement, il est simplement hors champ.
 *
 * `dvh` suit la hauteur réellement visible. La déclaration `100vh` RESTE en premier comme repli
 * pour les navigateurs qui ignorent `dvh` — ils lisent la première et ignorent la seconde.
 *
 * Vérifié dans le navigateur après correction, tiroir ouvert à 820×480 : tiroir 0→480 (exactement
 * la hauteur visible), menu qui DÉFILE, pied 423→480 entièrement visible. À 820×700 également.
 * L'égalité `vh == dvh` sur un navigateur d'ordinateur empêche d'y reproduire le défaut iOS
 * lui-même : ce test gèle la règle, la photo a montré le symptôme.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/styles/app.css'), 'utf8');

test('la barre latérale se mesure sur la hauteur RÉELLEMENT visible', () => {
    const regle = /^\.sidebar\{([^}]*)\}/m.exec(CSS);
    assert.ok(regle, 'règle .sidebar introuvable');
    /* L'ORDRE EST LA RÈGLE : le repli d'abord, `dvh` ensuite. Inversés, un navigateur qui
       comprend `dvh` verrait `100vh` l'écraser — et le défaut reviendrait sans que rien ne
       change à l'écran sur un poste de travail, là où les deux valent la même chose. */
    const iVh = regle[1].indexOf('height:100vh');
    const iDvh = regle[1].indexOf('height:100dvh');
    assert.ok(iVh >= 0, 'le repli 100vh doit rester pour les navigateurs sans dvh');
    assert.ok(iDvh >= 0, 'sans 100dvh, le pied repasse sous l\'écran quand la barre d\'adresse est déployée');
    assert.ok(iVh < iDvh, '100vh doit précéder 100dvh, sinon le repli écrase la correction');
});

test('une seule règle .sidebar — pas deux à cinq mille lignes d\'écart', () => {
    // Le piège du « j'ai modifié l'une sans voir l'autre », déjà rencontré sur `.crumbs`.
    assert.strictEqual((CSS.match(/^\.sidebar\{/gm) || []).length, 1);
    assert.strictEqual((CSS.match(/^\.app\{/gm) || []).length, 1);
});

test('le conteneur de l\'application suit la même hauteur', () => {
    const regle = /^\.app\{([^}]*)\}/m.exec(CSS);
    assert.ok(regle, 'règle .app introuvable');
    assert.match(regle[1], /min-height:100vh;min-height:100dvh/);
});

test('le pied ne cède jamais sa place au menu, et dégage la barre d\'accueil', () => {
    const regle = /\.side-foot-wrap\{([^}]*)\}/.exec(CSS);
    assert.ok(regle, 'règle .side-foot-wrap introuvable');
    /* `flex-shrink:0` : c'est lui qui porte l'identité connectée et la déconnexion. Un menu très
       long ne doit pas le comprimer — il vaut mieux faire défiler le menu, ce que `nav.menu` sait
       déjà faire. */
    assert.match(regle[1], /flex-shrink:0/);
    // Sur iPhone et iPad récents, la barre d'accueil recouvrait le bas du bouton. La valeur vaut
    // 0 sur un écran d'ordinateur : la règle n'y change rien.
    assert.match(regle[1], /padding-bottom:env\(safe-area-inset-bottom,0px\)/);
});

test('le menu, lui, défile — c\'est ce qui rend le pied tenable', () => {
    const regle = /nav\.menu\{([^}]*)\}/.exec(CSS);
    assert.ok(regle, 'règle nav.menu introuvable');
    assert.match(regle[1], /flex:1/);
    assert.match(regle[1], /overflow-y:auto/);
});
