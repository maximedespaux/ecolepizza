/**
 * SUIVI QUALIOPI SUR TÉLÉPHONE : LE NOM A SA LARGEUR (2026-09-21, puis la grille du 2026-09-24).
 *
 * LE DÉFAUT D'ORIGINE. Une ligne de dossier tenait sur une seule ligne quelle que soit la largeur :
 * chevron, formation, nom, avancement (90 px), score. À 375 px, tout ce qui n'était pas le nom prenait
 * environ 270 px des 313 disponibles. Mesuré au banc : la colonne du nom faisait de 0 à 24 px, un mot
 * par ligne, et chaque dossier montait à près de 200 px de haut. Le correctif d'alors faisait passer
 * l'état sous le nom.
 *
 * LA GRILLE (2026-09-24) a remplacé ces lignes : une table par formation, dix-huit colonnes de
 * documents. Elles ne tiennent pas dans 375 px, et ce n'est pas un défaut : c'est la GRILLE qui défile,
 * dans sa carte, sous le nom resté en place — jamais la page, et jamais au prix du nom. La leçon du
 * 21 tient en deux conditions, figées ici : le nom est collé à gauche avec une largeur à lui, et la
 * table vit dans un conteneur qui défile.
 *
 * Ce test ne mesure rien — un test Node n'a pas de moteur de rendu. La mesure a été faite au banc
 * (375 px) sur les données réelles de production du 2026-09-24.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const SUIVI = lireUi('pages/Suivi.jsx');
const CSS = lireUi('styles/app.css');

test('la grille défile dans sa carte, jamais la page', () => {
    assert.match(SUIVI, /<div className="tablewrap sg-wrap">\s*<table className="sg-table"/);
    assert.match(CSS, /\.tablewrap\{[^}]*overflow-x:auto;/, 'le conteneur de table de l\'application défile en largeur');
});

test('le nom reste en place et garde sa largeur, sur ordinateur comme sur téléphone', () => {
    assert.match(CSS, /\.sg-table \.sg-nom\{position:sticky;left:0;z-index:1;background:var\(--surface\);text-align:left;min-width:150px;/,
        'collé à gauche, sur son propre fond : sinon les cases défileraient au travers');
    const telephone = CSS.slice(CSS.indexOf('.sg-filtre{'));
    assert.match(telephone, /@media \(max-width:640px\)\{[\s\S]*?\.sg-table \.sg-nom\{min-width:128px\}/,
        'sur téléphone, 128 px : assez pour un nom, sans manger toute la largeur des cases');
    /* LA LIGNE D'UNE ENTREPRISE couvre toute la table ; son contenu, collé à gauche comme le nom,
       ne part pas avec le défilement. */
    assert.match(CSS, /\.sg-entreprise-in\{position:sticky;left:0;/);
    assert.match(CSS, /\.sg-table tbody tr:hover \.sg-nom\{background:var\(--surface2\)\}/,
        'au survol, le nom collé suit le fond de sa ligne');
});

test('plus de ligne dépliable : l\'ancienne mise en page est partie avec son CSS', () => {
    assert.doesNotMatch(SUIVI, /suivi-ligne|suivi-detail|suivi-groupe/);
    assert.doesNotMatch(CSS, /\.suivi-ligne|\.suivi-detail|\.suivi-groupe/);
});
