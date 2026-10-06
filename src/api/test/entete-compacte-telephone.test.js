/**
 * EN-TÊTE DE PAGE PLUS COMPACTE SUR TÉLÉPHONE — demandé le 2026-10-06 (réorganisation « téléphone »).
 * Le titre (32 px) et la marge en dessous (~56 px) repoussaient le contenu d'un tiers d'écran sur
 * toutes les fiches (Ventes, Stagiaire, Entreprise…). Titre resserré et marges réduites sous 640 px :
 * le contenu remonte, le titre reste nettement en vue.
 *
 * Test de source (CSS) : ces valeurs ne se voient pas sur écran large ; un retour en arrière
 * passerait inaperçu en revue.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');

test("sous 640 px, l'en-tête de page se resserre (titre et marges)", () => {
    assert.match(css, /EN-TÊTE DE PAGE PLUS COMPACTE SUR TÉLÉPHONE/, 'le bloc est présent et nommé');
    assert.match(css, /@media\(max-width:640px\)\{\.pagehead\{margin-bottom:16px;padding-bottom:14px;gap:12px\}\.pagehead h1\{font-size:27px/,
        'marges réduites et titre à 27 px sous 640 px');
    // La taille de base (42 px) reste, elle, hors média : desktop inchangé.
    assert.match(css, /\.pagehead h1\{font-size:42px/, 'le titre desktop reste à 42 px');
});
