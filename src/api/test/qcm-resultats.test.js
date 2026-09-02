/**
 * RÉSULTATS QCM (Qualité & conformité) — agrégation PAR QUESTION.
 *
 * On gèle le cœur : `aggregerQuestions`, pure (sans base). Les réponses arrivent telles qu'elles
 * sont stockées dans quiz_answer.value — ids d'options en CSV (QCU/QCM), valeur d'échelle, JSON de
 * grille. Deux pièges faciles à casser en retouchant : le « % de bonnes réponses » est l'ensemble
 * EXACT (ni incomplet, ni en trop), et l'ordre des ids cochés ne doit pas compter.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { aggregerQuestions } = require('../controllers/quiz.controller.js');

test('QCU : effectif + % par option, option correcte marquée, % de bonnes réponses', () => {
    const questions = [{ id: 'q1', position: 0, text: 'Q', type: 'SINGLE' }];
    const options = [
        { id: 'a', question_id: 'q1', text: 'A', is_correct: 1 },
        { id: 'b', question_id: 'q1', text: 'B', is_correct: 0 },
        { id: 'c', question_id: 'q1', text: 'C', is_correct: 0 },
    ];
    const answers = [{ question_id: 'q1', value: 'a' }, { question_id: 'q1', value: 'a' }, { question_id: 'q1', value: 'b' }];
    const [r] = aggregerQuestions(questions, options, answers);
    assert.strictEqual(r.responses, 3);
    const byText = Object.fromEntries(r.options.map((o) => [o.text, o]));
    assert.deepStrictEqual([byText.A.count, byText.A.pct], [2, 67]);
    assert.deepStrictEqual([byText.B.count, byText.B.pct], [1, 33]);
    assert.strictEqual(byText.C.count, 0);
    assert.strictEqual(byText.A.is_correct, true);
    assert.strictEqual(r.correct_pct, 67, '2 des 3 ont choisi la bonne option');
});

test('QCM multi : « entièrement correct » = ensemble choisi === ensemble correct (ordre indifférent)', () => {
    const questions = [{ id: 'q1', position: 0, text: 'Q', type: 'MULTI' }];
    const options = [
        { id: 'a', question_id: 'q1', text: 'A', is_correct: 1 },
        { id: 'b', question_id: 'q1', text: 'B', is_correct: 1 },
        { id: 'c', question_id: 'q1', text: 'C', is_correct: 0 },
    ];
    const answers = [
        { question_id: 'q1', value: 'a,b' },   // exactement {A,B}
        { question_id: 'q1', value: 'a' },      // incomplet
        { question_id: 'q1', value: 'a,b,c' },  // un distracteur en trop
        { question_id: 'q1', value: 'b,a' },    // {A,B} dans l'autre ordre
    ];
    const [r] = aggregerQuestions(questions, options, answers);
    assert.strictEqual(r.correct_pct, 50, '2 réponses sur 4 sont exactement {A,B}');
});

test('Échelle : répartition 1..max + moyenne au dixième', () => {
    const questions = [{ id: 'q1', position: 0, text: 'Satisfaction', type: 'SCALE', scale_max: 5 }];
    const answers = [{ question_id: 'q1', value: '5' }, { question_id: 'q1', value: '4' }, { question_id: 'q1', value: '5' }];
    const [r] = aggregerQuestions(questions, [], answers);
    assert.strictEqual(r.scale.dist[5], 2);
    assert.strictEqual(r.scale.dist[4], 1);
    assert.strictEqual(r.scale.dist[1], 0);
    assert.strictEqual(r.scale.avg, 4.7, '(5+4+5)/3 arrondi au dixième');
});

test('Grille : seulement le nombre de réponses (v1, pas de détail par cellule)', () => {
    const questions = [{ id: 'q1', position: 0, text: 'Grille', type: 'GRID_SINGLE' }];
    const answers = [{ question_id: 'q1', value: '{"0":[1]}' }, { question_id: 'q1', value: '{"0":[0]}' }];
    const [r] = aggregerQuestions(questions, [], answers);
    assert.strictEqual(r.grille, true);
    assert.strictEqual(r.responses, 2);
    assert.ok(!r.options, 'pas de répartition par option pour une grille en v1');
});

test('le détail expose aussi les résultats PAR STAGIAIRE (nom, %, date)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'quiz.controller.js'), 'utf8');
    assert.match(src, /questions: out, learners/, 'le détail renvoie la liste par stagiaire');
    assert.match(src, /LEFT JOIN learner l ON l\.id = r\.learner_id/, 'joint le stagiaire pour son nom');
    assert.match(src, /CASE WHEN r\.max_score > 0 THEN ROUND\(r\.score \/ r\.max_score \* 100\)/,
        'le % par réponse (NULL pour une enquête sans note) est calculé en base');
});

test('Aucune réponse : effectifs à 0, correct_pct null (jamais de division par zéro)', () => {
    const questions = [{ id: 'q1', position: 0, text: 'Q', type: 'SINGLE' }];
    const options = [{ id: 'a', question_id: 'q1', text: 'A', is_correct: 1 }];
    const [r] = aggregerQuestions(questions, options, []);
    assert.strictEqual(r.responses, 0);
    assert.strictEqual(r.options[0].pct, 0);
    assert.strictEqual(r.correct_pct, null);
});
