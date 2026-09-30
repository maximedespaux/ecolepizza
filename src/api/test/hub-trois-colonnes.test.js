/**
 * LES TROIS CHOIX DES FICHES TECHNIQUES TIENNENT SUR LA MÊME LIGNE — demandé par l'école le
 * 2026-09-30 : « les 3 options (Empâtement, Préparation, Réalisation) sur la même ligne ».
 *
 * LE DÉFAUT : la grille d'accueil (`hub-grid`) était en `repeat(auto-fill, minmax(250px, 340px))`.
 * Dès que la fenêtre rétrécissait un peu, les trois cartes retombaient en 2 + 1 — la troisième
 * seule sur une deuxième ligne. On fige donc trois colonnes pour cette grille-là (`hub-3`), avec
 * repli en une colonne sur téléphone.
 *
 * Le défaut se regèle en retirant la classe `hub-3` (retour à l'auto-fill) ou en repassant la
 * grille à deux colonnes : l'un comme l'autre rougit ici.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const page = fs.readFileSync(path.join(UI, 'pages', 'FichesTechniques.jsx'), 'utf8');
const hub = fs.readFileSync(path.join(UI, 'components', 'BuilderHub.jsx'), 'utf8');
const css = fs.readFileSync(path.join(UI, 'styles', 'app.css'), 'utf8');

test('L\'ÉCRAN demande trois colonnes à la grille d\'accueil, et BuilderHub les applique', () => {
    assert.match(page, /<BuilderHub className="hub-3"/, 'les fiches techniques figent trois colonnes');
    // BuilderHub accepte et pose la classe demandée sur la grille.
    assert.match(hub, /function BuilderHub\(\{ cards, className = "" \}\)/);
    assert.match(hub, /"hub-grid" \+ \(className \? " " \+ className : ""\)/, 'la classe reçue est ajoutée à la grille');
});

test('LA GRILLE « hub-3 » est bien à trois colonnes, et s\'empile sur téléphone', () => {
    assert.match(css, /\.hub-grid\.hub-3\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/,
        'trois colonnes égales : les trois cartes sur la même ligne');
    assert.match(css, /@media\(max-width:640px\)\{\.hub-grid\.hub-3\{grid-template-columns:minmax\(0,1fr\)\}\}/,
        'sur un téléphone, elles s\'empilent (minmax(0,1fr) : la colonne peut rétrécir, cf. telephone-debordements)');
});
