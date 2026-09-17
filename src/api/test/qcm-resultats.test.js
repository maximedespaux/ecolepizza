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
const { aggregerQuestions, clauseFiltre } = require('../controllers/quiz.controller.js');

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

test('la vue d\'ensemble rattache chaque QCM à sa FORMATION, « Autre » en dernier', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'quiz.controller.js'), 'utf8');
    assert.match(src, /p\.code AS program_code, p\.title AS program_title/, 'la formation accompagne chaque ligne');
    assert.match(src, /LEFT JOIN training_program p ON p\.id = q\.program_id/, 'jointure sur la formation (NULL = sans formation)');
    assert.match(src, /ORDER BY \(q\.program_id IS NULL\)/, 'les QCM sans formation (Autre) passent en dernier');
});

test('clauseFiltre : session et année passées DEUX fois (motif « ? IS NULL OR … = ? »)', () => {
    // Chaque valeur revient deux fois : une pour le test NULL, une pour l'égalité. L'oublier
    // décalerait les paramètres (l'année irait au test de session) — bug silencieux.
    /* LA SEMAINE A ÉTÉ AJOUTÉE LE 2026-09-17, À LA FIN. Ce test épinglait la liste ENTIÈRE ; il
       vérifie désormais ce qu'elle protégeait vraiment — que les quatre premiers paramètres n'ont
       pas bougé — puis ce qui s'ajoute. Insérée au milieu, la semaine aurait envoyé l'année au
       test de session, exactement le décalage silencieux que ce test décrit. */
    assert.deepStrictEqual(clauseFiltre('s1', 2026).params.slice(0, 4), ['s1', 's1', 2026, 2026]);
    assert.deepStrictEqual(clauseFiltre(null, null).params, [null, null, null, null, null, null, null],
        'sans filtre : les NULL neutralisent la clause, semaine comprise');
    assert.match(clauseFiltre('s1', null).sql, /session_id = \?[\s\S]*YEAR\(r\.completed_at\) = \?/, 'session via enrollment, année via YEAR');
});

test('clauseFiltre : la SEMAINE est celle de la SESSION, ajoutée en fin de paramètres', () => {
    /* Deux sessions tournaient la même semaine en production le 2026-09-17 — NIV1H et RS7404, toutes
       deux en S38, toutes deux avec des réponses. Filtrer par session obligeait à les lire l'une après
       l'autre. La semaine les réunit. */
    const f = clauseFiltre(null, null, '2026-38');
    assert.deepStrictEqual(f.params.slice(4), [2026, 2026, 38], 'test NULL, année, semaine — dans cet ordre');
    /* LA SEMAINE DE LA SESSION, PAS CELLE DE LA RÉPONSE : un QCM rempli le lundi suivant appartient à
       la session de la semaine d'avant. Filtrer sur `completed_at` l'aurait fait basculer. */
    assert.match(f.sql, /JOIN training_session s ON s\.id = e\.session_id WHERE s\.year = \? AND s\.week = \?/);
    assert.ok(!/WEEK\(r\.completed_at/.test(f.sql), 'jamais la semaine de la date de réponse');
});

test('lireSemaine : ce qui ne ressemble pas à une semaine est ignoré, pas refusé', () => {
    const { lireSemaine } = require('../controllers/quiz.controller.js');
    assert.deepStrictEqual(lireSemaine('2026-38'), { annee: 2026, semaine: 38 });
    assert.deepStrictEqual(lireSemaine('2026-05'), { annee: 2026, semaine: 5 }, 'la clé de lib/sessions.js est sur deux chiffres');
    /* Retomber sur « pas de filtre » plutôt que rendre une page vide qu'on prendrait pour « aucune
       réponse cette semaine ». */
    for (const v of ['2026-54', '2026-0', '38', '', null, "2026-38' OR 1=1"]) {
        assert.deepStrictEqual(lireSemaine(v), { annee: null, semaine: null }, `« ${v} » n'est pas une semaine`);
    }
});

test('supprimer une réponse : bornée à l\'organisation, réservée au bureau', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'quiz.controller.js'), 'utf8');
    assert.match(src, /DELETE FROM quiz_response WHERE id = \? AND organization_id = \?/,
        'jamais la réponse d\'une AUTRE organisation');
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'quiz.routes.js'), 'utf8');
    assert.match(routes, /router\.delete\('\/reponse\/:id', authorizeRoles\(\.\.\.ADMIN_ROLES\), deleteResponse\)/,
        'réservée au bureau (ADMIN_ROLES) — l\'auditeur voit la page mais ne supprime pas');
});

test('Aucune réponse : effectifs à 0, correct_pct null (jamais de division par zéro)', () => {
    const questions = [{ id: 'q1', position: 0, text: 'Q', type: 'SINGLE' }];
    const options = [{ id: 'a', question_id: 'q1', text: 'A', is_correct: 1 }];
    const [r] = aggregerQuestions(questions, options, []);
    assert.strictEqual(r.responses, 0);
    assert.strictEqual(r.options[0].pct, 0);
    assert.strictEqual(r.correct_pct, null);
});

test('par semaine, seuls les QCM qui ONT des réponses s\'affichent — sur « toutes », tous', () => {
    /* Le serveur rend TOUS les QCM (jointure à gauche) : sur vingt-deux, on en parcourait seize à zéro
       pour trouver les six de la semaine — l'inverse d'« avoir les réponses vite ». Mais sur « toutes
       les semaines », un QCM jamais rempli est une information en soi, celle d'un bilan : on le garde. */
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'ResultatsQCM.jsx'), 'utf8');
    assert.match(src, /const visibles = rows \? \(semaine \? rows\.filter\(\(q\) => q\.responses > 0\) : rows\) : \[\];/);
    assert.match(src, /grouperParFormation\(visibles\)/, 'la liste rend ce qui est visible');
    // L'export suit l'écran : exporter vingt-deux lignes quand on en montre six ferait mentir le fichier.
    assert.match(src, /const lignes = visibles\.map/);
    // L'année ne vaut que pour « toutes » : une semaine désigne déjà la sienne.
    assert.match(src, /semaine \? null : \(selYear \|\| null\)/);
});

test('la liste des semaines porte de quoi les RANGER, dans l\'ordre que le rangement suppose', () => {
    /* `grouperParSemaine` lit `year`, `week`, `code` et `inscrits`, et regroupe dans l'ORDRE REÇU. La
       liste d'origine ne portait que `id`, `code` et `start_date` : le sélecteur n'aurait rien pu en
       faire, et chaque session serait tombée dans une semaine « null-null ». */
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'quiz.controller.js'), 'utf8');
    const bloc = src.slice(src.indexOf('const resultatsOverview'), src.indexOf('const resultatsDetail'));
    assert.match(bloc, /SELECT s\.id, p\.code AS code, p\.title AS title, s\.year, s\.week,/);
    assert.match(bloc, /AS inscrits/);
    assert.match(bloc, /ORDER BY s\.start_date DESC`, \[orgId, orgId\]\)/, 'date décroissante : c\'est un contrat du rangement');
    // Toujours limité aux sessions QUI ONT DES RÉPONSES : une semaine vide ne se choisit pas.
    assert.match(bloc, /AND EXISTS \(SELECT 1 FROM quiz_response r JOIN enrollment e/);
    // Et les DEUX écrans filtrent sur la semaine.
    assert.strictEqual((src.match(/clauseFiltre\(sessionId, year, req\.query\.semaine\)/g) || []).length, 2);
});
