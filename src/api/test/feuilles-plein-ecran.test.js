/**
 * LES FENÊTRES DEVIENNENT DES FEUILLES PLEIN ÉCRAN SUR TÉLÉPHONE — demandé le 2026-10-06 (pass
 * « téléphone »). Centrée avec 20 px de marge, la fenêtre flottait au milieu de l'écran ; bord à
 * bord et ancrée en bas (une « feuille » qui monte), elle gagne ces pixels en largeur et met la
 * croix et les boutons du pied sous le pouce.
 *
 * Le test lit le CSS (readFileSync) : ces règles ne s'appliquent que sous 640 px, invisibles en
 * revue sur écran large. Le `backwards` est VÉRIFIÉ au passage : avec `both`/`forwards`, la feuille
 * resterait le bloc conteneur de toute popup `position:fixed` ouverte depuis elle (piège documenté
 * sur `.modal` de base).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');

test('sous 640 px, la fenêtre devient une feuille ancrée en bas, bord à bord', () => {
    assert.match(css, /FENÊTRE DEVIENT UNE FEUILLE QUI MONTE DU BAS/, 'le bloc est présent et nommé');
    // Voile sans marge, fenêtre collée en bas.
    assert.match(css, /\.overlay\{padding:0;align-items:end\}/, 'voile bord à bord, fenêtre ancrée en bas');
    // Pleine largeur (y compris les fenêtres larges), coins arrondis EN HAUT seulement.
    assert.match(css, /\.modal,\.modal\.wide\{max-width:100%;width:100%;[^}]*border-radius:16px 16px 0 0/, 'pleine largeur, coins hauts');
    // Glissé depuis le bas, en `backwards` (garde-fou du bloc conteneur).
    assert.match(css, /animation:feuille [^;}]*backwards/, 'animation en backwards, pas both/forwards');
    assert.match(css, /@keyframes feuille\{from\{transform:translateY\(100%\)\}to\{transform:translateY\(0\)\}\}/, 'elle monte du bas');
});
