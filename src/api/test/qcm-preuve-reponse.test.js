/**
 * LA PREUVE QU'UN STAGIAIRE A RÉPONDU — figée le jour de la réponse.
 *
 * LE DÉFAUT QU'ELLE RÉPARE. Enregistrer un QCM SUPPRIME ses questions et les recrée sous de
 * nouveaux identifiants — même quand on n'a changé que le titre — et `quiz_answer.question_id` ne
 * porte aucune clé étrangère. Les réponses déjà données désignent donc des lignes disparues : la
 * vue d'ensemble annonce « 12 réponses, moyenne 74 % » pendant que chaque question affiche
 * « 0 réponse ». Les données sont là, simplement plus rattachables.
 *
 * POURQUOI UN INSTANTANÉ PLUTÔT QUE DES IDENTIFIANTS STABLES. Garder les ids réparerait les
 * statistiques, pas la PREUVE. Une option retirée disparaît, un énoncé corrigé ne dit plus la même
 * chose, une question supprimée n'existe plus du tout. Un contrôle ne demande pas « quelle est la
 * question 3 aujourd'hui » mais « qu'a-t-on demandé à cette personne, et qu'a-t-elle répondu ».
 * La preuve doit donc être AUTONOME : elle recopie l'énoncé, les options et le choix en toutes
 * lettres, sans dépendre d'aucune autre table.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { construirePreuve } = require('../controllers/quiz.controller.js');

const API = path.join(__dirname, '..');
const RACINE = path.join(API, '..', '..');
const CTRL = fs.readFileSync(path.join(API, 'controllers/quiz.controller.js'), 'utf8');
const ROUTES = fs.readFileSync(path.join(API, 'routes/quiz.routes.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(RACINE, 'src/app/ui/pages/ResultatsQCM.jsx'), 'utf8');

const jeu = () => ({
    quiz: { title: 'Test de positionnement', kind: 'GRADED', pass_score: 60 },
    questions: [{ id: 'q1', text: 'La température idéale du four ?', type: 'SINGLE', points: 2 }],
    optsByQ: { q1: [{ id: 'o1', text: '250 °C', is_correct: 0 }, { id: 'o2', text: '450 °C', is_correct: 1 }] },
    rowsByQ: {},
    answerRows: [{ question_id: 'q1', value: 'o2' }],
    score: 2, maxScore: 2,
});

test('la preuve recopie les LIBELLÉS, pas des identifiants', () => {
    /* C'est tout l'enjeu : un id ne désignera plus rien dans six mois — ou pire, autre chose,
       puisque les questions sont recréées à chaque enregistrement. */
    const p = construirePreuve(jeu());
    const q = p.questions[0];
    assert.strictEqual(q.enonce, 'La température idéale du four ?', 'l\'énoncé du jour est conservé');
    assert.deepStrictEqual(q.choisi, ['450 °C'], 'le choix est lisible sans jointure');
    assert.deepStrictEqual(q.options.map((o) => o.texte), ['250 °C', '450 °C']);
    assert.deepStrictEqual(q.options.map((o) => o.choisie), [false, true]);
    assert.deepStrictEqual(q.options.map((o) => o.correcte), [false, true],
        'ce qui était la bonne réponse CE JOUR-LÀ, même si elle change ensuite');
});

test('la preuve ne dépend d\'aucune table : réécrire le QCM ne la touche pas', () => {
    const donnees = jeu();
    const p = construirePreuve(donnees);
    // On simule l'enregistrement qui suit : questions supprimées, recréées, énoncé corrigé.
    donnees.questions[0].id = 'nouvel-id';
    donnees.questions[0].text = 'Énoncé corrigé';
    donnees.optsByQ.q1 = [];
    assert.strictEqual(p.questions[0].enonce, 'La température idéale du four ?');
    assert.deepStrictEqual(p.questions[0].choisi, ['450 °C']);
});

test('le score et le seuil du jour sont dans la preuve', () => {
    const p = construirePreuve(jeu());
    assert.strictEqual(p.score, 2);
    assert.strictEqual(p.score_max, 2);
    assert.strictEqual(p.quiz.seuil, 60, 'le seuil de réussite peut changer : on garde celui du jour');
    assert.strictEqual(p.version, 1, 'une preuve relue dans trois ans doit dire de quel format elle est');
});

test('une grille est traduite en libellés, pas en positions', () => {
    /* La valeur stockée est un objet compact indexé par POSITION ({"0":[1]}). Relue avec la grille
       d'aujourd'hui, elle désignerait d'autres colonnes — le risque exact qu'on écarte. */
    const p = construirePreuve({
        ...jeu(),
        questions: [{ id: 'g1', text: 'Associez', type: 'GRID_SINGLE', points: 1 }],
        optsByQ: { g1: [{ id: 'c1', text: 'Vrai' }, { id: 'c2', text: 'Faux' }] },
        rowsByQ: { g1: [{ text: 'La pâte lève au froid' }] },
        answerRows: [{ question_id: 'g1', value: '{"0":[1]}' }],
    });
    assert.deepStrictEqual(p.questions[0].lignes, [{ libelle: 'La pâte lève au froid', choisi: ['Faux'] }]);
    assert.deepStrictEqual(p.questions[0].colonnes, ['Vrai', 'Faux']);
});

test('la preuve est écrite dans la MÊME requête que la réponse', () => {
    /* Une seconde requête pourrait échouer seule et laisser une réponse sans preuve, sans que
       personne ne l'apprenne — c'est-à-dire recréer le défaut qu'on corrige, en plus discret. */
    const bloc = CTRL.slice(CTRL.indexOf('const responseId = crypto.randomUUID()'), CTRL.indexOf('quiz_answer (id, response_id'));
    assert.match(bloc, /INSERT INTO quiz_response \(\$\{colonnes\.join\(', '\)\}\)/);
    assert.match(bloc, /construirePreuve\(\{ quiz: r\.quiz/);
    assert.doesNotMatch(bloc, /UPDATE quiz_response SET snapshot/, 'pas d\'écriture en deux temps');
});

test('sans la colonne, la réponse s\'enregistre QUAND MÊME', () => {
    /* Refuser la soumission d'un stagiaire parce qu'une migration n'est pas jouée serait le pire
       des échanges : on perdrait la réponse elle-même pour protéger sa preuve. */
    assert.match(CTRL, /const avecPreuve = await colonneExiste\(conn, 'quiz_response', 'snapshot'\);/);
    assert.match(CTRL, /\.concat\(avecPreuve \? \['snapshot'\] : \[\]\)/, 'la colonne n\'entre dans l\'INSERT que si elle existe');
});

test('la migration existe, avec son revert, et prévient de ce qu\'elle détruit', () => {
    const d = path.join(RACINE, 'database/migrations');
    const aller = fs.readFileSync(path.join(d, '144_quiz_reponse_preuve.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(d, '144_revert_quiz_reponse_preuve.sql'), 'utf8');
    assert.match(aller, /ADD COLUMN IF NOT EXISTS snapshot longtext/);
    assert.match(retour, /DROP COLUMN IF EXISTS snapshot/);
    // Le revert détruit des preuves : il doit le DIRE, personne ne relit une migration deux fois.
    assert.match(retour, /PREUVES|perd définitivement/i);
});

test('la route de la preuve précède /:id, sinon elle est inatteignable', () => {
    // Même piège que « resultats » face à `/:id` : « reponse » serait pris pour un identifiant.
    assert.ok(ROUTES.indexOf("'/resultats/reponse/:id'") < ROUTES.indexOf("'/resultats/:id'"));
});

test('les TROIS absences de preuve ne se confondent pas', () => {
    /* Afficher un questionnaire vide dans l'un de ces cas laisserait croire que le stagiaire n'a
       rien répondu — l'inverse exact de ce que la fonctionnalité doit établir. */
    for (const raison of ['migration', 'anterieure', 'illisible']) {
        assert.ok(CTRL.includes(`'${raison}'`), `le serveur distingue « ${raison} »`);
    }
    assert.match(PAGE, /raison === "migration"/);
    assert.match(PAGE, /raison === "illisible"/);
    assert.match(PAGE, /antérieure à l'enregistrement des preuves/);
    // Et le bouton ne s'affiche que s'il y a une preuve à montrer.
    assert.match(PAGE, /\{l\.a_preuve \? \(/);
});
