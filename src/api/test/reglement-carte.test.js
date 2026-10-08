/**
 * LA CARTE « RÈGLEMENT », CÔTÉ ÉCRAN (2026-10-08).
 *
 * 1) LA SAISIE DE LA DATE « payé le » NE SE BLOQUE PLUS À DEUX CHIFFRES D'ANNÉE.
 *    Le défaut : le champ date enregistrait à CHAQUE onChange. Or un <input type="date"> émet un
 *    onChange à chaque chiffre de l'année (0002, 0020, 0202, 2027) ; chaque enregistrement
 *    désactivait le champ (enCours) et rechargeait la carte, si bien que la saisie de l'année
 *    « se bloquait à deux chiffres ». La correction : champ NON CONTRÔLÉ (defaultValue + key) qui
 *    n'enregistre qu'au BLUR, comme le champ « référence » juste en dessous.
 *
 * 2) LE RÈGLEMENT A SON PROPRE ONGLET sur la fiche stagiaire (détaché de « Personnel »), comme sur
 *    la fiche entreprise.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (...p) => fs.readFileSync(path.join(UI, ...p), 'utf8');
const CARTE = lire('components', 'CarteReglement.jsx');

test('le champ date « Payé le » n\'enregistre plus à chaque frappe (non contrôlé, au blur)', () => {
    const z = CARTE.slice(CARTE.indexOf('<input key={date || ""}'), CARTE.indexOf('<input key={date || ""}') + 300);
    assert.match(z, /type="date"/);
    assert.match(z, /defaultValue=\{date \|\| ""\}/, 'non contrôlé');
    assert.match(z, /onBlur=\{\(e\) => \{ const v = e\.target\.value \|\| null; if \(v !== \(date \|\| null\)\) onDate\(v\); \}\}/, 'enregistré au blur');
    assert.doesNotMatch(z, /onChange/, 'plus d\'enregistrement à chaque chiffre de l\'année');
});

test('fiche stagiaire : le règlement est un onglet à part, hors de « Personnel »', () => {
    const FICHE = lire('pages', 'StagiaireDetail.jsx');
    assert.match(FICHE, /onClick=\{\(\) => setTab\("reglement"\)\}>Règlement<\/button>/, 'un bouton d\'onglet « Règlement »');
    assert.match(FICHE, /tab === "reglement" &&/, 'un bloc d\'onglet « Règlement »');
    assert.match(FICHE, /<CarteReglement learnerId=\{id\}/, 'qui rend la carte');
    // La carte n'est PLUS dans le bloc « Personnel » (entre le bouton Personnel et le bloc Règlement).
    const avantReglement = FICHE.slice(FICHE.indexOf('tab === "personnel"'), FICHE.indexOf('tab === "reglement" &&'));
    assert.doesNotMatch(avantReglement, /<CarteReglement/, 'sortie du bloc Personnel');
});
