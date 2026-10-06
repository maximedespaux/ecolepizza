/**
 * CONFORT TACTILE SUR TÉLÉPHONE — demandé le 2026-10-06 (« rendre l'UI plus agréable au doigt »).
 *
 * Au doigt, une cible confortable fait au moins ~40 px. Relevé à 375 px : les boutons-icônes des
 * cartes étaient à 32 px, ceux de la barre du haut à 38 px, les onglets de section à 26 px, le lien
 * de retour n'était qu'un texte de ~17 px. Sous 640 px (le point de rupture « téléphone » de la
 * feuille), tout cela grossit, et les rangées d'actions s'aèrent.
 *
 * Le test lit le CSS (readFileSync) : ces agrandissements ne se voient pas sur un écran large, et un
 * retrait passerait inaperçu en revue. Les valeurs de base (32 px…) restent, elles, hors média.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');

test('sous 640 px, les commandes atteignent une cible confortable au doigt', () => {
    // Le bloc existe, au bon point de rupture.
    assert.match(css, /CONFORT TACTILE SUR TÉLÉPHONE/, 'le bloc est présent et nommé');
    // Boutons-icônes des cartes : 32 → 40 px (ces déclarations n'existent QUE dans le bloc téléphone).
    assert.match(css, /\.iconbtn\{width:40px;height:40px;flex-basis:40px/, 'boutons-icônes des cartes à 40 px');
    // Barre du haut : 38 → 42 px.
    assert.match(css, /\.icon-btn\{width:42px;height:42px/, 'barre du haut à 42 px');
    // Lien de retour : une vraie zone de clic.
    assert.match(css, /button\.eyebrow\{[^}]*min-height:40px/, 'le lien de retour devient une vraie cible');
    // Rangées d'actions aérées.
    assert.match(css, /\.parc-gestes-multi,\.parc-geste-ligne\{gap:8px\}/, "les rangées d'actions s'aèrent");

    // Garde-fou : la taille de BASE (hors média) reste à 32 px — on agrandit sur mobile, pas partout.
    assert.match(css, /\n\.iconbtn\{width:32px;height:32px/, 'la base reste à 32 px (desktop inchangé)');
});
