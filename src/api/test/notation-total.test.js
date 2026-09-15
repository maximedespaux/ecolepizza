/**
 * LA NOTE GLOBALE — additionner ce qui est comparable, et seulement cela.
 *
 * L'ÉCRAN DE NOTATION NE NOTE RIEN : il ADDITIONNE ce qui a été saisi au QCM et sur la session.
 * Toute son utilité tient donc à la justesse de cette addition — et une addition fausse ne se
 * voit pas : elle rend un nombre plausible.
 */
const test = require('node:test');
const assert = require('node:assert');

const { fusionner, noteQcm } = require('../lib/notation.js');

test('deux sources de points s\'additionnent, et le pourcentage suit', () => {
    const t = fusionner({ qcm: { points: 15, max: 20 }, evaluation: { points: 70, max: 100 } });
    assert.strictEqual(t.points, 85);
    assert.strictEqual(t.max, 120);
    assert.strictEqual(t.percent, 71);
    assert.deepStrictEqual(t.sources, ['qcm', 'evaluation']);
    assert.strictEqual(t.partiel, false);
});

test('CE QUI N\'EXISTE PAS NE VAUT PAS ZÉRO', () => {
    /* LE TEST QUI COMPTE. Un stagiaire qui n'a pas encore passé le QCM n'a pas échoué au QCM.
       Compter l'absent comme un zéro ferait chuter la note de tous ceux qui n'ont pas fini —
       et le nombre affiché resterait parfaitement plausible. */
    const t = fusionner({ qcm: null, evaluation: { points: 70, max: 100 } }, ['qcm', 'evaluation']);
    assert.strictEqual(t.points, 70);
    assert.strictEqual(t.max, 100, 'le maximum ne compte que les épreuves passées');
    assert.strictEqual(t.percent, 70);
    assert.deepStrictEqual(t.sources, ['evaluation']);
    assert.strictEqual(t.partiel, true, 'et l\'on doit dire que le total ne porte pas sur tout');
});

test('LE CHEMIN RÉEL : un stagiaire sans aucun QCM garde sa note d\'évaluation', () => {
    /* La composition telle qu'elle se produit en production : `noteQcm([])` rend un maximum de
       zéro, et `fusionner` l'écarte. Les deux moitiés sont éprouvées séparément au-dessus ;
       celle-ci vérifie qu'ensemble elles font bien ce qu'on attend — c'est ce chaînage qui
       protège la note, pas l'une ou l'autre prise seule. */
    const t = fusionner({ qcm: noteQcm([]), evaluation: { points: 70, max: 100 } }, ['qcm', 'evaluation']);
    assert.strictEqual(t.percent, 70, 'l\'absence de QCM ne doit pas diviser la note par deux');
    assert.deepStrictEqual(t.sources, ['evaluation']);
    assert.strictEqual(t.partiel, true);
});

test('une source à maximum nul ne compte pas', () => {
    /* Une enquête de satisfaction n'a pas de maximum : la retenir ajouterait une épreuve
       imaginaire au dénominateur. */
    const t = fusionner({ qcm: { points: 0, max: 0 }, evaluation: { points: 8, max: 10 } });
    assert.deepStrictEqual(t.sources, ['evaluation']);
    assert.strictEqual(t.percent, 80);
});

test('aucune note du tout : pas de pourcentage inventé', () => {
    /* `null` et non zéro : « 0 % » se lit comme un résultat, pas comme une absence. */
    const t = fusionner({ qcm: null, evaluation: null });
    assert.strictEqual(t.max, 0);
    assert.strictEqual(t.percent, null);
});

test('le total ne dépasse jamais son maximum', () => {
    /* Une saisie aberrante d'une source ne doit pas produire un pourcentage au-dessus de cent,
       qu'on ne remarquerait qu'après coup. */
    const t = fusionner({ qcm: { points: 999, max: 20 } });
    assert.strictEqual(t.points, 20);
    assert.strictEqual(t.percent, 100);
});

/* ---------------------------------------------------------------------------------------- */

test('REPASSER UN QCM NE LE COMPTE PAS DEUX FOIS', () => {
    /* LE PIÈGE DE LA BASE. `quiz_response` est INSÉRÉ, jamais remplacé : une seconde tentative
       crée une seconde ligne. Les additionner compterait le même questionnaire deux fois,
       gonflerait le maximum, et ferait BAISSER la note de quelqu'un qui vient justement de se
       rattraper — l'exact contraire de ce qu'il a obtenu. */
    const n = noteQcm([
        { quiz_id: 'q1', score: 18, max_score: 20, completed_at: '2026-09-10 11:00:00', title: 'Hygiène' },
        { quiz_id: 'q1', score: 9, max_score: 20, completed_at: '2026-09-01 09:00:00', title: 'Hygiène' },
    ]);
    assert.strictEqual(n.max, 20, 'un seul QCM, un seul maximum');
    assert.strictEqual(n.points, 18, 'et c\'est la DERNIÈRE tentative qui compte');
    assert.strictEqual(n.quiz.length, 1);
});

test('plusieurs QCM distincts s\'additionnent', () => {
    const n = noteQcm([
        { quiz_id: 'q1', score: 18, max_score: 20, completed_at: '2026-09-10 11:00:00', title: 'Hygiène' },
        { quiz_id: 'q2', score: 30, max_score: 40, completed_at: '2026-09-11 11:00:00', title: 'Pâte' },
    ]);
    assert.strictEqual(n.points, 48);
    assert.strictEqual(n.max, 60);
    assert.strictEqual(n.percent, 80);
});

test('une enquête sans maximum est écartée du compte', () => {
    const n = noteQcm([
        { quiz_id: 'q1', score: 10, max_score: 10, completed_at: '2026-09-10 11:00:00', title: 'Noté' },
        { quiz_id: 'q2', score: null, max_score: null, completed_at: '2026-09-10 12:00:00', title: 'Satisfaction' },
    ]);
    assert.strictEqual(n.max, 10);
    assert.strictEqual(n.quiz.length, 1);
});

test('le seuil de réussite reste PROPRE À CHAQUE QCM', () => {
    /* Le total global n'a pas de seuil : chaque épreuve garde le sien. Les mêler donnerait un
       « réussi » global qu'aucun règlement ne définit. */
    const n = noteQcm([
        { quiz_id: 'q1', score: 12, max_score: 20, completed_at: '2026-09-10 11:00:00', pass_score: 70 },
        { quiz_id: 'q2', score: 18, max_score: 20, completed_at: '2026-09-10 11:00:00', pass_score: 70 },
        { quiz_id: 'q3', score: 18, max_score: 20, completed_at: '2026-09-10 11:00:00', pass_score: null },
    ]);
    assert.strictEqual(n.quiz.find((q) => q.quiz_id === 'q1').reussi, false);
    assert.strictEqual(n.quiz.find((q) => q.quiz_id === 'q2').reussi, true);
    assert.strictEqual(n.quiz.find((q) => q.quiz_id === 'q3').reussi, null, 'sans seuil, on ne tranche pas');
});

test('aucune réponse : rien, et surtout pas zéro sur zéro', () => {
    const n = noteQcm([]);
    assert.strictEqual(n.max, 0);
    assert.strictEqual(n.percent, null);
});

/* ---------------------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'controllers/notation.controller.js'), 'utf8');

test('SEULS LES QCM NOTÉS entrent dans le total', () => {
    /* Une enquête de satisfaction n'est pas une épreuve : la proposer ferait annoncer un QCM
       « non passé » à quelqu'un qui n'avait rien à passer. Le filtre est en SQL, au plus près
       de la lecture. */
    assert.match(SRC, /q\.kind = 'GRADED'/);
});

test('LE JURY N\'ENTRE PAS DANS LE TOTAL, et c\'est délibéré', () => {
    /* Il valide des COMPÉTENCES selon une règle (« 5 critères sur 6 dont C2.3 »). Le convertir
       en points ferait apparaître un nombre que personne n'a calculé et qui ne figure sur aucun
       document signé. */
    const appel = /fusionner\(\{([^}]*)\}/.exec(SRC);
    assert.ok(appel, 'le total doit passer par fusionner()');
    assert.doesNotMatch(appel[1], /jury/, 'le jury ne doit pas être une source de points');
});

test('les critères du jury ne sont pas comptés comme exercices du formateur', () => {
    /* Les deux grilles vivent dans la même table : un critère de jury est un exercice rattaché
       à une compétence. Sans l'exclusion, il gonflerait le maximum de l'évaluation pratique du
       formateur — c'est le même piège que dans l'éditeur, une couche plus bas. */
    assert.match(SRC, /\.filter\(\(x\) => x\.active && !x\.competence_id\)/);
});

test('l\'écran de notation N\'ÉCRIT RIEN', () => {
    /* Y ouvrir une saisie créerait un second endroit où noter, et deux endroits finissent
       toujours par ne plus dire la même chose. */
    const ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes/notation.routes.js'), 'utf8');
    assert.doesNotMatch(ROUTES, /router\.(post|put|patch|delete)/);
    assert.doesNotMatch(SRC, /INSERT INTO|UPDATE |DELETE FROM/);
});
