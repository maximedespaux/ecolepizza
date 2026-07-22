// Conversion « banque en base » -> « chapitres jouables », et résolution de l'XP.
//
// L'enjeu : le jeu ne doit JAMAIS recevoir une question injouable (QCM sans bonne réponse,
// association d'un seul couple). Une question cassée ne se voit pas à l'enregistrement, elle
// se découvre en pleine partie, côté stagiaire — d'où l'écartage silencieux testé ici.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildChapters, toGameQuestion, xpOf, XP_DEFAUT } = require('../lib/questcontent.js');
const { parseQuestionBody } = require('../controllers/questContent.controller.js');

const ch = (id, title, sort_order = 10) => ({ id, title, icon: 'wheat', sort_order });
const qcm = (id, chapter_id, extra = {}) => ({ id, chapter_id, type: 'QCM', text: 'Q ?', sort_order: 10, ...extra });
const opt = (question_id, sort_order, text, is_correct = 0, match_text = null) =>
    ({ question_id, sort_order, text, is_correct, match_text });

/* ---- XP ------------------------------------------------------------------------------- */

test('xpOf : la valeur de la question prime sur celle de la difficulté', () => {
    const diffs = new Map([['d1', { xp: 20 }]]);
    assert.equal(xpOf({ xp: 50, difficulty_id: 'd1' }, diffs), 50);
});

test('xpOf : sans valeur propre, on prend celle de la difficulté', () => {
    const diffs = new Map([['d1', { xp: 20 }]]);
    assert.equal(xpOf({ xp: null, difficulty_id: 'd1' }, diffs), 20);
});

test('xpOf : sans difficulté ni valeur, on prend le socle', () => {
    assert.equal(xpOf({ xp: null, difficulty_id: null }, new Map()), XP_DEFAUT);
    // difficulté supprimée entre-temps (FK ON DELETE SET NULL) : pas de plantage.
    assert.equal(xpOf({ xp: null, difficulty_id: 'disparue' }, new Map()), XP_DEFAUT);
});

test('xpOf : un XP à 0 est respecté, pas confondu avec « non renseigné »', () => {
    assert.equal(xpOf({ xp: 0, difficulty_id: null }, new Map()), 0);
});

/* ---- Conversion vers le format du jeu -------------------------------------------------- */

test('QCM : choix dans l’ordre et index de la bonne réponse', () => {
    const q = qcm('q1', 'c1');
    const opts = [opt('q1', 10, 'Faux A'), opt('q1', 20, 'Vrai', 1), opt('q1', 30, 'Faux B')];
    const g = toGameQuestion(q, opts, new Map());
    assert.equal(g.t, 'qcm');
    assert.deepEqual(g.c, ['Faux A', 'Vrai', 'Faux B']);
    assert.equal(g.a, 1);
    assert.equal(g.c[g.a], 'Vrai');
});

test('QCM sans bonne réponse : écarté', () => {
    const opts = [opt('q1', 10, 'A'), opt('q1', 20, 'B')];
    assert.equal(toGameQuestion(qcm('q1', 'c1'), opts, new Map()), null);
});

test('QCM à un seul choix : écarté', () => {
    assert.equal(toGameQuestion(qcm('q1', 'c1'), [opt('q1', 10, 'A', 1)], new Map()), null);
});

test('Vrai/Faux : la réponse vient de la question, pas des options', () => {
    const vrai = toGameQuestion({ id: 'q', type: 'VF', text: 'T', vf_answer: 1 }, [], new Map());
    const faux = toGameQuestion({ id: 'q', type: 'VF', text: 'T', vf_answer: 0 }, [], new Map());
    assert.deepEqual([vrai.t, vrai.a], ['vf', true]);
    assert.deepEqual([faux.t, faux.a], ['vf', false]);
});

test('Association : paires reconstituées', () => {
    const opts = [opt('q1', 10, 'W 250', 1, 'Napolitaine'), opt('q1', 20, 'W 400', 1, 'Renfort')];
    const g = toGameQuestion({ id: 'q1', type: 'ASSOC', text: 'Relie' }, opts, new Map());
    assert.equal(g.t, 'assoc');
    assert.deepEqual(g.pairs, [['W 250', 'Napolitaine'], ['W 400', 'Renfort']]);
});

test('Association d’une seule paire : écartée (ne teste rien)', () => {
    const opts = [opt('q1', 10, 'A', 1, 'B')];
    assert.equal(toGameQuestion({ id: 'q1', type: 'ASSOC', text: 'Relie' }, opts, new Map()), null);
});

test('explication et source remontent, absentes elles restent undefined', () => {
    const opts = [opt('q1', 10, 'A', 1), opt('q1', 20, 'B')];
    const avec = toGameQuestion(qcm('q1', 'c1', { explanation: 'Parce que', source: 'p. 17' }), opts, new Map());
    assert.equal(avec.expl, 'Parce que');
    assert.equal(avec.src, 'p. 17');
    const sans = toGameQuestion(qcm('q1', 'c1', { explanation: null, source: null }), opts, new Map());
    assert.equal(sans.expl, undefined);
    assert.equal(sans.src, undefined);
});

test('la difficulté (nom + couleur) accompagne la question, absente sinon', () => {
    const diffs = new Map([['d1', { name: 'Difficile', color: '#dc3e37', xp: 20 }]]);
    const opts = [opt('q1', 10, 'A', 1), opt('q1', 20, 'B')];
    const avec = toGameQuestion(qcm('q1', 'c1', { difficulty_id: 'd1' }), opts, diffs);
    assert.deepEqual(avec.diff, { name: 'Difficile', color: '#dc3e37' });
    // Sans difficulté : rien à afficher, donc pas de champ vide à gérer côté jeu.
    const sans = toGameQuestion(qcm('q2', 'c1', { difficulty_id: null }), opts, diffs);
    assert.equal(sans.diff, undefined);
});

/* ---- Assemblage des chapitres ---------------------------------------------------------- */

test('buildChapters : tri par sort_order, chapitres et questions', () => {
    const chapters = [ch('c2', 'Second', 20), ch('c1', 'Premier', 10)];
    const questions = [
        qcm('q2', 'c1', { sort_order: 20, text: 'Deux' }),
        qcm('q1', 'c1', { sort_order: 10, text: 'Un' }),
        qcm('q3', 'c2', { sort_order: 10, text: 'Trois' }),
    ];
    const options = ['q1', 'q2', 'q3'].flatMap((id) => [opt(id, 10, 'bon', 1), opt(id, 20, 'faux')]);
    const out = buildChapters(chapters, questions, options, []);
    assert.deepEqual(out.map((c) => c.title), ['Premier', 'Second']);
    assert.deepEqual(out[0].questions.map((q) => q.q), ['Un', 'Deux']);
    assert.equal(out[0].ic, 'wheat');
});

test('buildChapters : un chapitre sans question jouable disparaît', () => {
    // Le QCM n'a pas de bonne réponse : la question saute, donc le chapitre est vide.
    const out = buildChapters([ch('c1', 'Vide')], [qcm('q1', 'c1')], [opt('q1', 10, 'A'), opt('q1', 20, 'B')], []);
    assert.deepEqual(out, []);
});

test('buildChapters : l’XP de la difficulté est appliqué aux questions', () => {
    const diffs = [{ id: 'd1', xp: 25 }];
    const questions = [qcm('q1', 'c1', { difficulty_id: 'd1', xp: null })];
    const out = buildChapters([ch('c1', 'Ch')], questions, [opt('q1', 10, 'A', 1), opt('q1', 20, 'B')], diffs);
    assert.equal(out[0].questions[0].xp, 25);
});

/* ---- Validation à l'enregistrement ------------------------------------------------------ */

test('parseQuestionBody refuse un QCM sans bonne réponse désignée', () => {
    const r = parseQuestionBody({ type: 'QCM', text: 'Q', choices: ['A', 'B'] });
    assert.ok(r.error, 'devrait refuser');
});

test('parseQuestionBody refuse un index de bonne réponse hors liste', () => {
    const r = parseQuestionBody({ type: 'QCM', text: 'Q', choices: ['A', 'B'], correct_index: 5 });
    assert.ok(r.error);
});

test('parseQuestionBody accepte un QCM correct et marque la bonne option', () => {
    const r = parseQuestionBody({ type: 'QCM', text: 'Q', choices: ['A', 'B', 'C'], correct_index: 2 });
    assert.equal(r.error, undefined);
    assert.deepEqual(r.options.map((o) => o.is_correct), [0, 0, 1]);
});

test('parseQuestionBody ignore les choix vides', () => {
    const r = parseQuestionBody({ type: 'QCM', text: 'Q', choices: ['A', '   ', 'B'], correct_index: 1 });
    assert.deepEqual(r.options.map((o) => o.text), ['A', 'B']);
});

test('parseQuestionBody refuse un vrai/faux sans réponse', () => {
    assert.ok(parseQuestionBody({ type: 'VF', text: 'Q' }).error);
    assert.equal(parseQuestionBody({ type: 'VF', text: 'Q', vf_answer: false }).vf, 0);
    assert.equal(parseQuestionBody({ type: 'VF', text: 'Q', vf_answer: true }).vf, 1);
});

test('parseQuestionBody refuse une association incomplète', () => {
    assert.ok(parseQuestionBody({ type: 'ASSOC', text: 'Q', pairs: [{ text: 'A', match_text: 'B' }] }).error);
    // Une paire à moitié remplie ne compte pas.
    assert.ok(parseQuestionBody({ type: 'ASSOC', text: 'Q', pairs: [{ text: 'A', match_text: 'B' }, { text: 'C', match_text: '' }] }).error);
});

test('parseQuestionBody refuse un énoncé vide ou un type inconnu', () => {
    assert.ok(parseQuestionBody({ type: 'QCM', text: '   ' }).error);
    assert.ok(parseQuestionBody({ type: 'SONDAGE', text: 'Q' }).error);
});
