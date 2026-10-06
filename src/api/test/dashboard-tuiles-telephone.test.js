/**
 * LES TUILES DU TABLEAU DE BORD RESTENT À DEUX COLONNES SUR TÉLÉPHONE — demandé le 2026-10-06
 * (réorganisation « téléphone »). Une tuile est un NOMBRE ; empilées sur une colonne, les quatre
 * remplissaient le premier écran et repoussaient « À traiter » (ce qui appelle une action) sous la
 * ligne de flottaison. À deux colonnes, les quatre chiffres ET la zone d'action tiennent d'un coup.
 *
 * Test de source : la grille des tuiles porte sa classe, et la CSS la met à deux colonnes sous
 * 560 px avec une spécificité qui l'emporte sur le repli « une colonne » des grilles génériques.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ui = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');

test('la grille des tuiles porte dash-kpis et passe à 2 colonnes sous 560 px', () => {
    const dash = ui('pages/Dashboard.jsx');
    assert.match(dash, /className="grid cols-4 dash-kpis"/, 'la grille des indicateurs est marquée');

    const css = ui('styles/app.css');
    assert.match(css, /@media\(max-width:560px\)\{\.grid\.dash-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
        'deux colonnes sous 560 px, sélecteur .grid.dash-kpis (l\'emporte sur .cols-4)');
    // Le repli générique à UNE colonne reste, lui, pour les autres grilles cols-4.
    assert.match(css, /\.cols-4\{grid-template-columns:minmax\(0,1fr\)\}/, 'les autres cols-4 restent à une colonne');
});
