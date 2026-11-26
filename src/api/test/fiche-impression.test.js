/**
 * IMPRESSION D'UNE FICHE TECHNIQUE — demandé par l'école le 2026-11-26.
 *
 * Deux défauts sur « Imprimer » (FichePrint, → window.print()) :
 *
 *   1) FEUILLE BLANCHE. Il y a DEUX blocs `@media print` dans app.css. Celui de la feuille de
 *      PROGRESSION pose `body *{visibility:hidden}` puis ne révèle que `.print-area`. Les deux
 *      blocs s'appliquant ensemble, tout le contenu de la fiche (`.fiche-print`) restait masqué →
 *      page blanche. Le bloc de la fiche doit RÉ-AFFICHER explicitement `.fiche-print` et ses
 *      descendants (plus spécifique que `body *`, il l'emporte).
 *
 *   2) NOM DU PDF. Le navigateur nomme le PDF d'après `document.title` (le titre de l'app). On le
 *      remplace par le nom de la FICHE le temps de l'impression, puis on le remet.
 *
 * Tests de SOURCE (comme fiche-partage-defaut / fiche-nom-obligatoire) : ni base ni navigateur.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'app', 'ui');
const css = fs.readFileSync(path.join(APP, 'styles/app.css'), 'utf8');
const fichePrint = fs.readFileSync(path.join(APP, 'components/FichePrint.jsx'), 'utf8');

test('le bloc @media print de la fiche RÉ-AFFICHE la feuille (sinon page blanche)', () => {
    // Le bloc .fiche-print ré-affiche `.fiche-print, .fiche-print *` en visible !important.
    assert.match(
        css,
        /\.fiche-print\s*,\s*\.fiche-print \*\s*\{\s*visibility:\s*visible\s*!important/,
        'le bloc print doit ré-afficher .fiche-print et ses descendants',
    );
});

test('le contexte qui causait le bug existe toujours (l\'autre bloc masque tout)', () => {
    // On gèle la RAISON du correctif : tant que la feuille de progression cache `body *`, la
    // contre-mesure ci-dessus est nécessaire. Si ce bloc disparaît un jour, ce test rougit et
    // invite à relire — pas à supprimer le correctif à l'aveugle.
    assert.match(css, /body \*\s*\{\s*visibility:\s*hidden\s*!important/, 'l\'autre feuille cache encore body *');
});

test('« Imprimer » nomme le PDF d\'après la fiche, puis remet le titre', () => {
    assert.match(fichePrint, /const nom = \(fiche\.name \|\| ""\)\.trim\(\)/, 'le nom du PDF vient de la fiche');
    assert.match(fichePrint, /document\.title = nom/, 'le titre devient celui de la fiche avant impression');
    assert.match(fichePrint, /document\.title = precedent/, 'le titre d\'origine est remis');
    assert.match(fichePrint, /addEventListener\("afterprint"/, 'remise au retour d\'impression');
    assert.match(fichePrint, /window\.print\(\)/, 'l\'impression est bien déclenchée');
    // Le bouton appelle le handler nommé, plus `() => window.print()` nu.
    assert.match(fichePrint, /onClick=\{imprimer\}/, 'le bouton passe par le handler qui nomme le PDF');
});
