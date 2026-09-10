/**
 * ENREGISTRER UN QCM NE DOIT PLUS DÉTACHER LES RÉPONSES DÉJÀ DONNÉES.
 *
 * LE DÉFAUT. `saveQuiz` faisait `DELETE FROM quiz_question WHERE quiz_id = ?` puis réinsérait TOUT
 * sous de nouveaux identifiants — même quand on n'avait changé que le titre. Or
 * `quiz_answer.question_id` ne porte aucune clé étrangère : les réponses déjà données n'étaient ni
 * supprimées ni recalées, elles désignaient des lignes disparues. La vue d'ensemble annonçait
 * « 12 réponses, moyenne 74 % » pendant que chaque question affichait « 0 réponse ».
 *
 * POURQUOI CE TEST PILOTE UNE FAUSSE BASE plutôt que de lire le source. Une expression régulière
 * dirait que le mot « UPDATE » est présent ; elle ne dirait pas que la question EXISTANTE est bien
 * mise à jour sous SON identifiant, que la nouvelle en reçoit un neuf, et que seule la disparue
 * est supprimée. Ici on inspecte les requêtes RÉELLEMENT émises, dans l'ordre.
 */
const test = require('node:test');
const assert = require('node:assert');

/* La fausse base remplace `config/database.js` AVANT que le contrôleur ne soit chargé : il en
   reçoit donc l'exemplaire truqué. `node --test` exécute chaque fichier dans son propre processus,
   la substitution ne déborde pas sur les autres tests. */
const cheminDb = require.resolve('../config/database.js');
const requetes = [];
function reponse(sql) {
    if (/FROM quiz WHERE id/.test(sql)) return [[{ id: 'quiz1' }]];
    if (/SELECT image FROM quiz_question/.test(sql)) return [[]];
    if (/SELECT points FROM quiz_row/.test(sql)) return [[]];
    if (/SELECT id FROM quiz_question WHERE quiz_id/.test(sql)) return [[{ id: 'q-gardee' }, { id: 'q-retiree' }]];
    if (/SELECT id FROM quiz_option WHERE question_id/.test(sql)) return [[{ id: 'o-gardee' }]];
    if (/SELECT id FROM quiz_row WHERE question_id/.test(sql)) return [[]];
    return [{ affectedRows: 1 }];
}
const faux = {
    promise: () => ({ query: async (sql, params) => { requetes.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params }); return reponse(sql); } }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },  // logAudit
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { saveQuiz } = require('../controllers/quiz.controller.js');

async function enregistrer(questions) {
    requetes.length = 0;
    let corps = null;
    const res = { status() { return this; }, json(b) { corps = b; return this; } };
    await saveQuiz({
        params: { id: 'quiz1' },
        user: { organization_id: 'org1', id: 'u1' },
        body: { title: 'Test', kind: 'GRADED', questions },
    }, res);
    return corps;
}
const emises = (re) => requetes.filter((r) => re.test(r.sql));

test('une question DÉJÀ répondue garde son identifiant', async () => {
    await enregistrer([{ id: 'q-gardee', text: 'Énoncé corrigé', type: 'SINGLE', points: 2, options: [] }]);
    const maj = emises(/^UPDATE quiz_question SET/);
    assert.strictEqual(maj.length, 1, 'la question existante est MISE À JOUR, pas recréée');
    assert.ok(maj[0].params.includes('q-gardee'), 'sous son propre identifiant');
    assert.strictEqual(emises(/^INSERT INTO quiz_question/).length, 0, 'et rien n\'est réinséré à sa place');
});

test('une question NOUVELLE reçoit un identifiant neuf', async () => {
    await enregistrer([{ text: 'Question ajoutée', type: 'SINGLE', points: 1, options: [] }]);
    const ins = emises(/^INSERT INTO quiz_question/);
    assert.strictEqual(ins.length, 1);
    assert.ok(!ins[0].params.includes('q-gardee'), 'jamais l\'identifiant d\'une autre');
});

test('seule la question RETIRÉE est supprimée', async () => {
    /* Le remplacement en bloc supprimait tout ; ici on ne supprime que ce qui a disparu de
       l'écran, et on le dit explicitement au moteur avec un NOT IN. */
    await enregistrer([{ id: 'q-gardee', text: 'Toujours là', type: 'SINGLE', points: 1, options: [] }]);
    const sup = emises(/^DELETE FROM quiz_question/);
    assert.strictEqual(sup.length, 1);
    assert.match(sup[0].sql, /WHERE quiz_id = \? AND id NOT IN \(\?\)/);
    assert.deepStrictEqual(sup[0].params[1], ['q-gardee'], 'la gardée est épargnée, la retirée part');
});

test('les OPTIONS gardent aussi leur identifiant', async () => {
    /* `quiz_answer.value` contient des identifiants d'OPTIONS : garder celui de la question sans
       garder ceux des options laisserait les compteurs par réponse à zéro. */
    await enregistrer([{ id: 'q-gardee', text: 'Q', type: 'SINGLE', points: 1,
        options: [{ id: 'o-gardee', text: '450 °C', is_correct: true }, { text: 'Option neuve' }] }]);
    const majO = emises(/^UPDATE quiz_option SET/);
    assert.strictEqual(majO.length, 1, 'l\'option existante est mise à jour');
    assert.ok(majO[0].params.includes('o-gardee'));
    assert.strictEqual(emises(/^INSERT INTO quiz_option/).length, 1, 'la neuve est insérée');
});

test('un identifiant ÉTRANGER n\'écrase jamais rien', async () => {
    /* Réutiliser un id sans vérifier qu'il appartient à CE questionnaire laisserait un appel
       malveillant — ou une copie maladroite — écraser la question d'un autre QCM. */
    await enregistrer([{ id: 'venu-d-ailleurs', text: 'Q', type: 'SINGLE', points: 1, options: [] }]);
    assert.strictEqual(emises(/^UPDATE quiz_question SET/).length, 0, 'aucune mise à jour');
    assert.strictEqual(emises(/^INSERT INTO quiz_question/).length, 1, 'une ligne NEUVE, à la place');
});

test('les options ne se devinent JAMAIS par position', async () => {
    /* Une option sans identifiant est neuve, point. Deviner par index réattribuerait les réponses
       à la mauvaise option dès qu'on en insère une en tête — pire que de les perdre, car
       silencieux et faux. */
    await enregistrer([{ id: 'q-gardee', text: 'Q', type: 'SINGLE', points: 1,
        options: [{ text: 'Insérée en tête' }, { id: 'o-gardee', text: 'Ancienne' }] }]);
    const ins = emises(/^INSERT INTO quiz_option/);
    assert.strictEqual(ins.length, 1, 'celle sans id est insérée…');
    assert.ok(!ins[0].params.includes('o-gardee'), '…sans emprunter l\'identifiant de l\'ancienne');
    const maj = emises(/^UPDATE quiz_option SET/);
    assert.strictEqual(maj[0].params[0], 1, 'l\'ancienne descend en position 1, sans changer d\'identité');
});
