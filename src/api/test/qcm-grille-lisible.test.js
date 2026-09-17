/**
 * UNE QUESTION EN GRILLE SE CORRIGE ET SE RÉCAPITULE — les deux étaient vides.
 *
 * SIGNALÉ PAR L'ÉCOLE le 2026-09-17, sur « Évaluation Formative du Jeudi » (RS7404) : « pour la
 * réponse en tableau, le résultat côté organisme et côté stagiaire n'est pas clair du tout ».
 * La question : quatorze allergènes, à cocher Oui ou Non, pour une calzone dont la pâte contient
 * 5 % de graines torréfiées et 10 % de farine de soja.
 *
 * CE QUE CHACUN LISAIT, mesuré sur les vraies réponses :
 *   · l'ÉCOLE : « grille · 4 réponse(s) (détail par cellule à venir) ». Rien d'autre, depuis la
 *     création des grilles ;
 *   · le STAGIAIRE : deux puces, « Non » et « Oui », ni cochées ni bonnes, et aucun ✓ sur la
 *     question — alors que Miguel MARQUEZ avait répondu juste aux quatorze lignes. La correction
 *     traitait la grille comme une question à choix : ses « options » sont ses COLONNES, et la
 *     valeur stockée `{"0":[1],"1":[1],…}` était découpée sur les virgules.
 *
 * Les fixtures ci-dessous SONT les réponses de production (anonymes dans le test : A, B, C, D).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { aggregerQuestions, buildReview, ligneJuste, lireGrille } = require('../controllers/quiz.controller.js');

const LIGNES = [['Gluten', [1]], ['Sésame', [1]], ['Fruits à coque', [0]], ['Crustacés', [0]], ['Oeuf', [1]],
    ['Poisson', [0]], ['Moutarde', [0]], ['Lait', [1]], ['Celeri', [0]], ['Arachide', [0]], ['Soja', [1]],
    ['Mollusque', [0]], ['Lupin', [0]], ['Anhydride sulfureux/sulfite', [0]]]
    .map(([text, correct]) => ({ text, correct, points: 2 }));
const Q = { id: 'q6', position: 5, text: 'Allergènes', type: 'GRID_SINGLE' };
const COLONNES = [{ id: 'cNon', question_id: 'q6', text: 'Non', is_correct: 0 },
    { id: 'cOui', question_id: 'q6', text: 'Oui', is_correct: 0 }];
const REPONSES = {
    A: '{"0":[1],"1":[0],"2":[1],"3":[0],"4":[1],"5":[0],"6":[0],"7":[1],"8":[0],"9":[1],"10":[1],"11":[1],"12":[0],"13":[0]}',
    B: '{"0":[1],"1":[0],"2":[0],"3":[0],"4":[1],"5":[0],"6":[0],"7":[1],"8":[0],"9":[0],"10":[0],"11":[0],"12":[0],"13":[0]}',
    C: '{"0":[1],"1":[0],"2":[1],"3":[0],"4":[1],"5":[0],"6":[0],"7":[1],"8":[0],"9":[0],"10":[0],"11":[0],"12":[0],"13":[0]}',
    D: '{"0":[1],"1":[1],"2":[0],"3":[0],"4":[1],"5":[0],"6":[0],"7":[1],"8":[0],"9":[0],"10":[1],"11":[0],"12":[0],"13":[0]}',
};

test('une ligne est juste avec EXACTEMENT les bonnes colonnes — et non notée sans bonne réponse', () => {
    assert.strictEqual(ligneJuste([1], [1]), true);
    assert.strictEqual(ligneJuste([1], [0]), false);
    assert.strictEqual(ligneJuste([1], [0, 1]), false, 'cocher en trop n\'est pas juste');
    assert.strictEqual(ligneJuste([1], []), false, 'ne rien cocher non plus');
    // Une ligne sans bonne réponse déclarée n'est pas une faute : l'école ne l'a pas corrigée.
    assert.strictEqual(ligneJuste([], [1]), null);
});

test('la correction du stagiaire montre ses QUATORZE lignes, et qu\'il a tout juste', () => {
    /* D a répondu juste partout. Sa correction affichait deux puces sans coche et aucun ✓. */
    const [r] = buildReview([Q], { q6: COLONNES }, { q6: lireGrille(REPONSES.D) }, { q6: LIGNES });
    assert.deepStrictEqual(r.colonnes, ['Non', 'Oui']);
    assert.strictEqual(r.lignes.length, 14, 'les allergènes eux-mêmes apparaissent');
    assert.ok(r.lignes.every((l) => l.juste === true));
    assert.strictEqual(r.correct, true, 'et la question porte enfin son ✓');
    assert.ok(!r.options, 'plus de liste « Non / Oui » prise pour des options');
});

test('…et, pour qui s\'est trompé, OÙ', () => {
    const [r] = buildReview([Q], { q6: COLONNES }, { q6: lireGrille(REPONSES.A) }, { q6: LIGNES });
    const fausses = r.lignes.filter((l) => l.juste === false).map((l) => l.texte);
    assert.deepStrictEqual(fausses, ['Sésame', 'Fruits à coque', 'Arachide', 'Mollusque']);
    const sesame = r.lignes.find((l) => l.texte === 'Sésame');
    assert.deepStrictEqual({ choisies: sesame.choisies, bonnes: sesame.bonnes }, { choisies: [0], bonnes: [1] },
        'a coché « Non » là où c\'était « Oui »');
    assert.strictEqual(r.correct, false);
});

test('la même correction, que la grille vienne de la BASE ou de l\'ENVOI', () => {
    /* Deux chemins : relire une réponse déjà donnée (valeur stockée, une chaîne JSON — elle était
       découpée sur les virgules) et corriger juste après l'envoi (l'objet de la grille — il était
       glissé tel quel dans un ensemble). Ils doivent dire exactement la même chose. */
    const depuisBase = buildReview([Q], { q6: COLONNES }, { q6: REPONSES.A }, { q6: LIGNES });
    const depuisEnvoi = buildReview([Q], { q6: COLONNES }, { q6: JSON.parse(REPONSES.A) }, { q6: LIGNES });
    assert.deepStrictEqual(depuisBase, depuisEnvoi);
});

test('le récapitulatif de l\'école dit quels allergènes posent problème', () => {
    const [a] = aggregerQuestions([Q], COLONNES, Object.values(REPONSES).map((value) => ({ question_id: 'q6', value })), { q6: LIGNES });
    const par = Object.fromEntries(a.grille.lignes.map((l) => [l.texte, l]));
    /* Le sésame — les graines torréfiées de la pâte — est passé inaperçu chez trois sur quatre. */
    assert.strictEqual(par['Sésame'].juste_pct, 25);
    assert.deepStrictEqual(par['Sésame'].comptes, [3, 1], '3 « Non », 1 « Oui »');
    assert.strictEqual(par['Soja'].juste_pct, 50);
    assert.strictEqual(par['Fruits à coque'].juste_pct, 50);
    assert.strictEqual(par['Gluten'].juste_pct, 100);
    assert.deepStrictEqual(par['Gluten'].bonnes, [1], 'la bonne colonne voyage avec la ligne');
    assert.strictEqual(a.responses, 4);
});

test('note, correction et récapitulatif appliquent UNE seule règle de ligne juste', () => {
    /* Réécrite trois fois, elle aurait pu dire « juste » sur une ligne qui n'a rapporté aucun point. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'quiz.controller.js'), 'utf8');
    assert.ok((src.match(/ligneJuste\(/g) || []).length >= 4, 'déclarée une fois, appelée par les trois');
    assert.ok(!/correct\.size > 0 && correct\.size === sel\.size/.test(src), 'plus de copie de la règle dans la note');
});

test('les écrans rendent les grilles en TABLEAU, et les énoncés gardent leurs retours à la ligne', () => {
    const UI = path.join(__dirname, '..', '..', 'app', 'ui');
    /* Sans les commentaires : ils racontent l'ancien affichage — « détail par cellule à venir » —
       pour expliquer pourquoi il a disparu, et l'assertion d'ABSENCE les trouvait. */
    const sansCommentaires = (src) => src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const res = sansCommentaires(fs.readFileSync(path.join(UI, 'pages/ResultatsQCM.jsx'), 'utf8'));
    const quiz = sansCommentaires(fs.readFileSync(path.join(UI, 'components/QuizModal.jsx'), 'utf8'));
    assert.match(res, /<TableauGrille grille=\{q\.grille\} \/>/, 'organisme : le récapitulatif en tableau');
    assert.ok(!/détail par cellule à venir/.test(res), 'plus de promesse de v2 à l\'écran');
    assert.match(quiz, /q\.lignes \? \(\s*<CorrectionGrille q=\{q\} \/>/, 'stagiaire : la correction en tableau');
    /* La liste de l'énoncé EST la question : c'est en lisant « graines torréfiées » qu'on trouve le
       sésame. En un seul paragraphe, on ne la lisait plus. */
    assert.strictEqual((res.match(/<b style=\{ENONCE\}>\{num\}\. \{q\.text\}<\/b>/g) || []).length, 4);
    assert.match(res, /const ENONCE = \{ whiteSpace: "pre-line" \};/);
    assert.strictEqual((quiz.match(/whiteSpace: "pre-line"/g) || []).length, 2, 'correction ET passage du QCM');
});
