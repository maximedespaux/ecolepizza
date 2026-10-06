/**
 * LA LÉGENDE DES STATISTIQUES NE DOIT PAS FAIRE DÉFILER LA PAGE — relevé le 2026-10-06 en passant
 * chaque écran au format téléphone (375 px) : la page Statistiques était la seule à « se dézoomer »,
 * c'est-à-dire à défiler horizontalement (154 px de trop).
 *
 * La cause : `.stat-legende` est un `display:flex` SANS `flex-wrap`. Une dizaine de formations
 * alignées (RS7404, NIV2, NIV1, NIV1H, NIV1PRO, Sans formation, Équipe…) dépassent la largeur d'un
 * téléphone, et tout le document part en largeur. La correction tient en un mot-clé : la légende
 * passe à la ligne.
 *
 * Le test lit la règle CSS (readFileSync, comme treize autres tests lisent le source) : retirer le
 * `flex-wrap` ferait resurgir le défilement, invisible sur un écran large.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');

test('la légende des statistiques passe à la ligne (pas de défilement horizontal sur mobile)', () => {
    const regle = css.match(/\.stat-legende\{[^}]*\}/);
    assert.ok(regle, '.stat-legende introuvable');
    assert.match(regle[0], /flex-wrap:\s*wrap/, 'sans flex-wrap, la légende déborde à 375 px et toute la page défile');
});
