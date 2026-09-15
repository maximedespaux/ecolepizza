/**
 * PIZZA QUEST EST-IL UTILISÉ ? — le bilan, et les trois pièges de son calcul.
 *
 * DEMANDÉ par l'organisme : voir combien de questions ont été répondues, pour savoir si le jeu
 * sert. Relevé avant d'écrire : la banque compte 68 chapitres et 477 questions, et la base ne
 * garde AUCUNE réponse — une ligne par (stagiaire, monde, rang) avec ses étoiles, rien d'autre.
 * Le nombre de questions ne peut donc être que DÉDUIT : un chapitre terminé vaut ses questions
 * jouables. C'est assumé, écrit à l'écran, et c'est ce que ce fichier gèle.
 *
 * LES TROIS PIÈGES, tous vérifiés ici :
 *   1. `step` n'est pas un identifiant, c'est un RANG dans la liste JOUABLE — celle que le jeu
 *      monte, triée par `sort_order` et PURGÉE des chapitres sans question exploitable.
 *      Compter avec un simple `ORDER BY sort_order` attribuerait les parties au mauvais
 *      chapitre dès qu'un chapitre est vide.
 *   2. la même table porte les MINI-JEUX (« constructeur », « pate »…), qui ne sont pas des
 *      chapitres et ne posent aucune question.
 *   3. une progression dont le rang n'existe plus est ORPHELINE : la banque a changé. La jeter
 *      en silence ferait disparaître des parties réellement jouées.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { usageQuest } = require('../lib/questUsage.js');
const { chapitreFait } = require('../lib/cadresQuest.js');

/* Une banque volontairement PIÉGEUSE : le chapitre du milieu n'a aucune question exploitable,
   il ne figure donc PAS dans la liste jouable. Les rangs enregistrés sont 0 et 1 — 1 désigne
   « Le four », pas « Vide ». C'est exactement là qu'un calcul naïf se trompe de chapitre. */
const vf = (id, chapter_id, sort_order) => ({ id, chapter_id, type: 'VF', text: 'q' + id,
    vf_answer: 1, sort_order, active: 1 });
const BANK = {
    difficulties: [],
    options: [],
    chapters: [
        { id: 'ch-farine', program_id: 'p1', title: 'La farine', sort_order: 10, active: 1 },
        { id: 'ch-vide', program_id: 'p1', title: 'Chapitre vide', sort_order: 20, active: 1 },
        { id: 'ch-four', program_id: 'p1', title: 'Le four', sort_order: 30, active: 1 },
    ],
    questions: [
        vf('q1', 'ch-farine', 1), vf('q2', 'ch-farine', 2), vf('q3', 'ch-farine', 3),
        // « ch-vide » n'a que des questions INACTIVES : rien à jouer.
        { ...vf('q4', 'ch-vide', 1), active: 0 },
        vf('q5', 'ch-four', 1), vf('q6', 'ch-four', 2),
    ],
};
const PROGRAMS = [{ id: 'p1', code: 'RS7404', title: 'Fabriquer des pizzas' }];

test('LE RANG DÉSIGNE LA LISTE JOUABLE, PAS LA LISTE DES CHAPITRES', () => {
    /* LE PIÈGE. Trié par `sort_order`, le rang 1 serait « Chapitre vide ». Dans la liste
       JOUABLE — la seule que le jeu affiche et numérote — le rang 1 est « Le four ». Se
       tromper ici, c'est créditer un chapitre que personne n'a pu jouer. */
    const u = usageQuest({ programs: PROGRAMS, bank: BANK,
        progress: [{ learner_id: 'a', world: 'RS7404', step: '1', stars: 3 }] });
    assert.strictEqual(u.chapitres.length, 1);
    assert.strictEqual(u.chapitres[0].titre, 'Le four', 'le rang 1 est le 2e chapitre JOUABLE');
    assert.strictEqual(u.chapitres[0].questions, 2);
    assert.strictEqual(u.chapitresDisponibles, 2, 'le chapitre vide ne compte pas comme jouable');
    assert.strictEqual(u.questionsDisponibles, 5, 'et ses questions inactives non plus');
});

test('LES QUESTIONS SE DÉDUISENT DES CHAPITRES TERMINÉS', () => {
    const u = usageQuest({ programs: PROGRAMS, bank: BANK, stagiaires: 10, progress: [
        { learner_id: 'a', world: 'RS7404', step: '0', stars: 3 }, // La farine : 3 questions
        { learner_id: 'b', world: 'RS7404', step: '0', stars: 1 }, // idem, autre stagiaire
        { learner_id: 'a', world: 'RS7404', step: '1', stars: 2 }, // Le four : 2 questions
    ] });
    assert.strictEqual(u.questionsParcourues, 3 + 3 + 2);
    assert.strictEqual(u.chapitresTermines, 3, 'trois parties terminées');
    assert.strictEqual(u.chapitresTouches, 2, 'sur deux chapitres différents');
    assert.strictEqual(u.joueurs, 2);
    assert.strictEqual(u.stagiaires, 10, 'l\'effectif situe le nombre de joueurs');
    assert.strictEqual(u.parfaits, 1, 'seule la partie à 3 étoiles est sans faute');
    assert.strictEqual(u.etoiles, 6);
});

test('UN CHAPITRE COMMENCÉ SANS ÊTRE ACQUIS NE COMPTE PAS', () => {
    /* Même règle que les cadres — et c'est la MÊME fonction, importée, pas recopiée : une règle
       de comptage écrite à deux endroits finit par donner deux chiffres. */
    assert.strictEqual(chapitreFait(0), false);
    assert.strictEqual(chapitreFait(1), true);
    const u = usageQuest({ programs: PROGRAMS, bank: BANK,
        progress: [{ learner_id: 'a', world: 'RS7404', step: '0', stars: 0 }] });
    assert.strictEqual(u.chapitresTermines, 0);
    assert.strictEqual(u.questionsParcourues, 0);
    assert.strictEqual(u.joueurs, 1, 'mais la personne a bien touché au jeu');
});

test('LES MINI-JEUX NE SONT PAS DES CHAPITRES', () => {
    /* Ils vivent dans la MÊME table, au rang 0, sous leur clé. Les compter comme des chapitres
       gonflerait « chapitres terminés » et inventerait des questions : un mini-jeu n'en pose
       aucune. Les ignorer, à l'inverse, sous-estimerait l'usage réel. */
    const u = usageQuest({ programs: PROGRAMS, bank: BANK, progress: [
        { learner_id: 'a', world: 'constructeur', step: '0', stars: 3 },
        { learner_id: 'b', world: 'constructeur', step: '0', stars: 2 },
        { learner_id: 'a', world: 'pate', step: '0', stars: 1 },
    ] });
    assert.strictEqual(u.chapitresTermines, 0, 'aucun chapitre');
    assert.strictEqual(u.questionsParcourues, 0, 'aucune question');
    assert.deepStrictEqual(u.miniJeux.map((m) => [m.cle, m.joueurs]), [['constructeur', 2], ['pate', 1]]);
    assert.strictEqual(u.joueurs, 2, 'mais deux personnes ont joué');
});

test('UNE PARTIE QUI NE SE RATTACHE PLUS EST COMPTÉE, PAS JETÉE', () => {
    /* La banque a changé : le rang 7 n'existe plus. Le silence ferait disparaître des parties
       réellement jouées, et personne ne saurait que le compte est incomplet. */
    const u = usageQuest({ programs: PROGRAMS, bank: BANK, progress: [
        { learner_id: 'a', world: 'RS7404', step: '7', stars: 3 },
        { learner_id: 'a', world: 'RS7404', step: '0', stars: 3 },
    ] });
    assert.strictEqual(u.orphelines, 1);
    assert.strictEqual(u.chapitresTermines, 1, 'seule la partie rattachable est comptée');
});

test('UNE FORMATION SANS BANQUE N\'INVENTE RIEN', () => {
    const u = usageQuest({ programs: [{ id: 'p9', code: 'VIDE', title: 'Sans questions' }],
        bank: BANK, progress: [] });
    assert.strictEqual(u.chapitresDisponibles, 0);
    assert.strictEqual(u.questionsDisponibles, 0);
    assert.deepStrictEqual(u.parFormation.map((f) => f.chapitres), [0]);
});

test('AUCUN JOUEUR : des zéros francs, pas des NaN', () => {
    const u = usageQuest({ programs: PROGRAMS, bank: BANK, progress: [], stagiaires: 42 });
    for (const [k, v] of Object.entries(u)) {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} doit être un nombre fini`);
    }
    assert.strictEqual(u.joueurs, 0);
    assert.strictEqual(u.questionsParcourues, 0);
    assert.strictEqual(u.questionsDisponibles, 5, 'la banque, elle, existe toujours');
});

test('TOUS LES MINI-JEUX DU JEU ONT UN LIBELLÉ DANS L\'ÉCRAN D\'USAGE', () => {
    /* La liste FAISANT FOI est celle de `PizzaQuest.jsx`. Celle de l'écran d'usage ne sert qu'à
       nommer une clé venue de la base — un mini-jeu ajouté là-bas et oublié ici s'afficherait
       sous sa clé brute. Lisible, mais pas soigné, et personne ne s'en apercevrait. */
    const UI = path.join(__dirname, '..', '..', 'app', 'ui');
    const jeu = fs.readFileSync(path.join(UI, 'pages/PizzaQuest.jsx'), 'utf8');
    const admin = fs.readFileSync(path.join(UI, 'pages/QuestManager.jsx'), 'utf8');
    const cles = [...new Set([...jeu.matchAll(/\bkey: "([a-z]+)"/g)].map((m) => m[1]))].sort();
    assert.ok(cles.length >= 8, `au moins huit mini-jeux attendus, vu ${cles.length}`);
    const table = admin.slice(admin.indexOf('const MINI_JEUX = {'));
    for (const c of cles) {
        assert.match(table, new RegExp(`\\b${c}:`), `« ${c} » n'a pas de libellé dans l'écran d'usage`);
    }
});
