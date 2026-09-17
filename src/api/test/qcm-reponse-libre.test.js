/**
 * QCM — LA RÉPONSE LIBRE (type TEXT, migration 164), limitée en MOTS.
 *
 * Demandé le 2026-09-17 : « une réponse texte (ouverte), avec une limite, quelque chose comme 128
 * mots ». Les cinq types existants ne laissaient choisir que parmi ce que l'école avait prévu.
 *
 * Ce que ces tests gardent :
 *  · LA LIMITE TIENT CÔTÉ SERVEUR — un compteur d'écran se contourne en collant du texte ou en
 *    appelant la route ; le refus tombe avant toute écriture, le stagiaire peut raccourcir ;
 *  · LE MÊME COMPTE À L'ÉCRAN ET AU SERVEUR, sinon « 128 / 128 » s'afficherait sur un refus ;
 *  · RIEN N'EST NOTÉ AUTOMATIQUEMENT : ni score, ni maximum, ni « ✗ » dans la correction ;
 *  · PAS DE QUESTION ABÎMÉE AVANT LA MIGRATION : un ENUM qui ignore `TEXT` rangerait une chaîne vide
 *    en silence (vu sur `notification.type`) — l'enregistrement est refusé, et le dit.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* ── Base simulée, posée AVANT le chargement du contrôleur ─────────────────────────────────── */
const cheminDb = require.resolve('../config/database.js');
let scenario = {};
const emises = [];
let ecrituresTransaction = [];
function repondre(sql, params) {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    emises.push({ sql: q, params });
    if (/COLUMN_TYPE AS t FROM information_schema\.columns/.test(q)) return [scenario.enumAvecTexte ? [{ t: "enum('SINGLE','MULTI','SCALE','GRID_SINGLE','GRID_MULTI','TEXT')" }] : [{ t: "enum('SINGLE','MULTI','SCALE','GRID_SINGLE','GRID_MULTI')" }]];
    if (/FROM information_schema\.columns/.test(q)) {
        if (params && params.includes('max_words')) return [scenario.colonneMots ? [{ 1: 1 }] : []];
        return [[{ 1: 1 }]]; // snapshot, image… : présentes
    }
    if (/FROM information_schema\.tables/.test(q)) return [[]];
    if (/FROM generated_document d LEFT JOIN learner l/.test(q)) return [[{ id: 'doc1', organization_id: 'org', quiz_id: 'qz', status: 'ENVOYE', user_id: 'u1' }]];
    if (/^SELECT \* FROM quiz WHERE id = \? AND organization_id = \?/.test(q)) return [[{ id: 'qz', title: 'Évaluation', kind: 'GRADED', pass_score: 50 }]];
    if (/SELECT enrollment_id FROM document_formation/.test(q)) return [[{ enrollment_id: 'enr1' }]];
    if (/FROM quiz_question WHERE quiz_id = \? ORDER BY position/.test(q)) return [scenario.questions || []];
    if (/FROM quiz_option WHERE question_id IN/.test(q)) return [scenario.options || []];
    if (/^SELECT id FROM quiz WHERE id = \? AND organization_id = \?/.test(q)) return [[{ id: 'qz' }]];
    if (/SELECT id FROM training_program WHERE organization_id/.test(q)) return [[]];
    if (/^SELECT id FROM quiz_question WHERE quiz_id = \?/.test(q)) return [[]];
    if (/^SELECT (id FROM quiz_option|id FROM quiz_row|image FROM|points FROM)/.test(q)) return [[]];
    return [{ affectedRows: 1 }];
}
const faux = {
    promise: () => ({
        query: async (sql, params) => repondre(sql, params),
        getConnection: async () => ({
            beginTransaction: async () => {},
            query: async (sql, params) => { ecrituresTransaction.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params }); return [{}]; },
            commit: async () => {}, rollback: async () => {}, release: () => {},
        }),
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); }, // logAudit
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { submitQuiz, saveQuiz, buildReview, construirePreuve, aggregerQuestions } = require('../controllers/quiz.controller.js');
const { compterMots, motsMaxDe, reponseLibreDisponible, MOTS_MAX_DEFAUT } = require('../lib/reponseLibre.js');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const sansCommentaires = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}
const QUESTIONS = [
    { id: 'qt', text: 'Expliquez le boulage.', type: 'TEXT', scale_max: 5, points: 0, partial_scoring: 0, image: null, max_words: 5 },
    { id: 'qs', text: 'Température du four ?', type: 'SINGLE', scale_max: 5, points: 2, partial_scoring: 0, image: null, max_words: null },
];
const OPTIONS = [
    { id: 'o1', question_id: 'qs', text: '450 °C', is_correct: 1 },
    { id: 'o2', question_id: 'qs', text: '200 °C', is_correct: 0 },
];

async function envoyer(answers) {
    scenario = { questions: QUESTIONS, options: OPTIONS, colonneMots: true };
    ecrituresTransaction = [];
    const r = reponse();
    await submitQuiz({ params: { documentId: 'doc1' }, body: { answers }, user: { id: 'u1', organization_id: 'org', role: 'STAGIAIRE' } }, r);
    return r;
}

test('compter les mots : une suite de caractères entre deux espaces', () => {
    assert.strictEqual(compterMots(''), 0);
    assert.strictEqual(compterMots('   \n '), 0);
    assert.strictEqual(compterMots("  L'école  forme des\npizzaïolos — porte-pelle en main. "), 7);
    /* LA PONCTUATION FRANÇAISE N'EST PAS UN MOT. « : ? ! ; — » s'écrivent précédés d'une espace :
       compter les blocs entre espaces en faisait des mots, et une réponse de 128 mots bien ponctuée
       aurait été refusée. Vu sur banc d'essai avant la mise en service. */
    assert.strictEqual(compterMots('Le repos détend le gluten : la pâte s\'étale mieux ! Pourquoi ? Parce que…'), 12);
    assert.strictEqual(compterMots('— ; : ! ?'), 0);
    assert.strictEqual(compterMots('Cuire 90 secondes à 450 °C.'), 6, 'les nombres sont des mots, « °C. » aussi (une lettre)');
    assert.strictEqual(motsMaxDe({ max_words: null }), MOTS_MAX_DEFAUT);
    assert.strictEqual(MOTS_MAX_DEFAUT, 128, 'la limite demandée par l\'école');
    assert.strictEqual(motsMaxDe({ max_words: '40' }), 40);
    assert.strictEqual(motsMaxDe({ max_words: 99999 }), 1000, 'plafonnée');
});

test('l\'écran et le serveur comptent EXACTEMENT pareil', async () => {
    const ecran = await import('../../app/ui/lib/mots.js');
    for (const t of ['', 'un', "l'école", ' deux  mots ', 'ligne\nligne\tligne', 'a — b', 'É à ç ÿ', 'x'.repeat(300),
        'gluten : pâte ! four ?', '— ; :', '12 % de 450 °C', '« guillemets » et … points']) {
        assert.strictEqual(ecran.compterMots(t), compterMots(t), `« ${t.slice(0, 20)} »`);
    }
    assert.strictEqual(ecran.MOTS_MAX_DEFAUT, MOTS_MAX_DEFAUT);
});

test('au-delà de la limite : refus, AVANT toute écriture', async () => {
    const r = await envoyer({ qt: 'un deux trois quatre cinq six', qs: 'o1' });
    assert.strictEqual(r.code, 422);
    assert.match(r.corps.error, /^Question 1 : 6 mots, pour 5 au plus\./);
    assert.strictEqual(ecrituresTransaction.length, 0, 'aucune réponse à moitié écrite : le stagiaire peut raccourcir et renvoyer');
});

test('dans la limite : enregistrée telle qu\'écrite, et NON notée', async () => {
    const r = await envoyer({ qt: '  un deux trois quatre cinq  ', qs: 'o1' });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.strictEqual(r.corps.data.score, 2);
    assert.strictEqual(r.corps.data.max_score, 2, 'la réponse libre n\'ajoute rien au maximum');
    const ins = ecrituresTransaction.filter((e) => /^INSERT INTO quiz_answer/.test(e.sql));
    const libre = ins.find((e) => e.params[2] === 'qt');
    assert.strictEqual(libre.params[3], 'un deux trois quatre cinq', 'le texte, épuré de ses espaces de bord');
    const relue = r.corps.data.review.find((q) => q.id === 'qt');
    assert.deepStrictEqual(relue, { id: 'qt', text: 'Expliquez le boulage.', type: 'TEXT', reponse: 'un deux trois quatre cinq', correct: null },
        'relue au stagiaire, SANS verdict');
});

test('la correction ne sanctionne pas une réponse libre', () => {
    const [q] = buildReview([{ id: 'qt', text: 'Pourquoi ?', type: 'TEXT' }], {}, { qt: 'Parce que.' });
    assert.strictEqual(q.correct, null);
    assert.strictEqual(q.reponse, 'Parce que.');
});

test('la preuve fige le texte, son compte et la limite d\'ALORS', () => {
    const p = construirePreuve({
        quiz: { title: 'Q', kind: 'GRADED', pass_score: null },
        questions: [{ id: 'qt', text: 'Pourquoi ?', type: 'TEXT', points: 0, max_words: 30 }],
        optsByQ: {}, rowsByQ: {}, answerRows: [{ question_id: 'qt', value: 'Parce que la pâte repose.' }], score: 0, maxScore: 0,
    });
    const [q] = p.questions;
    assert.strictEqual(q.texte, 'Parce que la pâte repose.');
    assert.strictEqual(q.mots, 5);
    assert.strictEqual(q.mots_max, 30);
    assert.strictEqual(q.points, null, 'aucun point prêté');
});

test('les résultats listent les textes, avec leur auteur — pas les réponses vides', () => {
    const [r] = aggregerQuestions([{ id: 'qt', position: 0, text: 'Pourquoi ?', type: 'TEXT' }], [], [
        { question_id: 'qt', value: 'Pour la pousse.', nom: 'Léa DURAND', le: '2026-09-17 10:02' },
        { question_id: 'qt', value: '   ', nom: 'Paul MARTIN', le: '2026-09-17 10:05' },
        { question_id: 'autre', value: 'hors sujet' },
    ]);
    assert.strictEqual(r.responses, 2);
    assert.deepStrictEqual(r.textes, [{ texte: 'Pour la pousse.', nom: 'Léa DURAND', le: '2026-09-17 10:02' }]);
    const src = sansCommentaires(lire('src/api/controllers/quiz.controller.js'));
    assert.match(src, /LEFT JOIN learner l ON l\.id = r\.learner_id\s+WHERE r\.quiz_id = \?` \+ f\.sql/, 'l\'auteur vient de la requête du détail');
});

test('avant la migration 164 : une réponse libre n\'est PAS enregistrée — et on le dit', async () => {
    scenario = { enumAvecTexte: false, colonneMots: false };
    emises.length = 0;
    const r = reponse();
    await saveQuiz({ params: { id: 'qz' }, user: { organization_id: 'org', id: 'u1' },
        body: { title: 'Q', kind: 'GRADED', formations: [], questions: [{ text: 'Pourquoi ?', type: 'TEXT' }] } }, r);
    assert.strictEqual(r.code, 422);
    assert.match(r.corps.error, /migration 164/);
    assert.strictEqual(emises.filter((e) => /^(UPDATE|INSERT|DELETE)/.test(e.sql)).length, 0,
        'refus AVANT la moindre écriture : ni le titre, ni une question sans type');
});

test('après la migration : 0 point, la limite écrite (128 par défaut), et plus d\'options', async () => {
    scenario = { enumAvecTexte: true, colonneMots: true };
    emises.length = 0;
    const r = reponse();
    await saveQuiz({ params: { id: 'qz' }, user: { organization_id: 'org', id: 'u1' },
        body: { title: 'Q', kind: 'GRADED', formations: [], questions: [{ text: 'Pourquoi ?', type: 'TEXT', points: 5, options: [{ text: 'reste' }] }] } }, r);
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    const ins = emises.find((e) => /^INSERT INTO quiz_question/.test(e.sql));
    assert.match(ins.sql, /, max_words\) VALUES/);
    assert.strictEqual(ins.params[4], 'TEXT');
    assert.strictEqual(ins.params[6], 0, 'une réponse libre ne rapporte aucun point, même si on en saisit');
    assert.strictEqual(ins.params[ins.params.length - 1], 128);
    assert.ok(emises.some((e) => /^DELETE FROM quiz_option WHERE question_id = \?$/.test(e.sql)), 'les options d\'un ancien type partent');
    assert.ok(!emises.some((e) => /^INSERT INTO quiz_option/.test(e.sql)));
});

test('la base connaît-elle TEXT ? L\'ENUM ET la colonne, lus dans le schéma', async () => {
    const conn = (enumTexte, colonne) => ({ query: async (sql, params) => {
        if (/COLUMN_TYPE/.test(sql)) return [[{ t: enumTexte ? "enum('SINGLE','TEXT')" : "enum('SINGLE')" }]];
        return [colonne && params && params.includes('max_words') ? [{ 1: 1 }] : []];
    } });
    assert.strictEqual(await reponseLibreDisponible(conn(true, true)), true);
    assert.strictEqual(await reponseLibreDisponible(conn(true, false)), false, 'ENUM sans la colonne : non');
    assert.strictEqual(await reponseLibreDisponible(conn(false, true)), false, 'colonne sans l\'ENUM : non');
});

test('la migration étend l\'ENUM, ajoute la limite ; son revert retire d\'abord les questions', () => {
    const m = lire('database/migrations/164_qcm_reponse_libre.sql').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(m, /MODIFY COLUMN type enum\('SINGLE','MULTI','SCALE','GRID_SINGLE','GRID_MULTI','TEXT'\) NOT NULL DEFAULT 'SINGLE'/);
    assert.match(m, /ADD COLUMN IF NOT EXISTS max_words SMALLINT UNSIGNED DEFAULT NULL/);
    assert.match(m, /ALTER TABLE quiz_answer MODIFY COLUMN value TEXT DEFAULT NULL;/, 'une réponse de 128 mots dépasse 255 caractères');
    const rv = lire('database/migrations/164_revert_qcm_reponse_libre.sql').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(rv.indexOf("DELETE FROM quiz_question WHERE type = 'TEXT'") > -1);
    assert.ok(rv.indexOf("DELETE FROM quiz_question WHERE type = 'TEXT'") < rv.indexOf('MODIFY COLUMN type'),
        'les questions TEXT partent AVANT de réduire l\'ENUM, sinon elles deviendraient des questions sans type');
});

test('les écrans : type proposé, compteur sans troncature, réponses lisibles', () => {
    const editeur = lire('src/app/ui/pages/Quiz.jsx');
    assert.match(editeur, /\{ v: "TEXT", label: "Réponse libre \(texte\)" \}/);
    assert.match(editeur, /<label>Mots maximum<\/label>/);
    const modale = sansCommentaires(lire('src/app/ui/components/QuizModal.jsx'));
    const zone = modale.slice(modale.indexOf('function ReponseLibre'), modale.indexOf('function QuizModal'));
    assert.match(zone, /onChange=\{\(e\) => onChange\(e\.target\.value\)\}/, 'la frappe n\'est JAMAIS coupée : un texte collé serait tronqué en silence');
    assert.doesNotMatch(zone, /slice\(|substring\(|maxLength/);
    assert.match(zone, /aria-live="polite"/, 'le compteur est annoncé');
    assert.match(modale, /if \(qq\.type === "TEXT"\) \{ const n = compterMots\(v\); return n > 0 && n <= \(qq\.max_words \|\| MOTS_MAX_DEFAUT\); \}/);
    const resultats = sansCommentaires(lire('src/app/ui/pages/ResultatsQCM.jsx'));
    assert.match(resultats, /if \(q\.textes\) \{/);
    assert.match(resultats, /q\.type === "TEXT" \? \(/, 'la preuve affiche le texte');
});
