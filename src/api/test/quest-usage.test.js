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

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   PAR SESSION : QUI A JOUÉ, ET JUSQU'OÙ.

   L'agrégat global dit SI le jeu sert ; une session dit À QUI. C'est le niveau où l'école agit
   — on ne relance pas « les stagiaires », on relance la promotion de la semaine 38.

   LE TAUX DE RÉUSSITE NE PEUT PAS ÊTRE EXACT, et c'est le sujet de la moitié de ces tests. Le
   jeu n'enregistre que les ÉTOILES, qui bornent le score (3 ⇒ ≥ 90 % de bonnes réponses, 2 ⇒
   ≥ 70 %, 1 ⇒ ≥ 50 %). On en tire donc un PLANCHER — « au moins N justes » — au lieu d'un
   pourcentage inventé. Et comme la ligne garde le MEILLEUR essai, c'est un plancher au meilleur
   essai : deux réserves, toutes deux écrites à l'écran. */
const SESSIONS = [{ id: 's38', program_id: 'p1', year: 2026, week: 38, status: 'EN_COURS' }];
const INSCRITS = [
    { learner_id: 'a', session_id: 's38' },
    { learner_id: 'b', session_id: 's38' },
    { learner_id: 'c', session_id: 's38' }, // inscrit, n'a jamais joué
];
const NOMS = [{ id: 'a', nom: 'HANY Jérémy' }, { id: 'b', nom: 'JOFFRE Elodie' }, { id: 'c', nom: 'MARQUEZ Miguel' }];
const parSession = (progress) => usageQuest({ programs: PROGRAMS, bank: BANK, progress,
    sessions: SESSIONS, enrollments: INSCRITS, apprenants: NOMS }).parSession[0];

test('LE PLANCHER DE BONNES RÉPONSES SUIT LE BARÈME DU JEU', async () => {
    const { bonnesReponsesMin } = await import('../lib/questUsage.js');
    /* ⌈0,9 × 7⌉ = 7 : sur sept questions, trois étoiles ne s'obtiennent qu'au sans-faute —
       6/7 = 0,857 reste sous la barre. C'est exactement ce qu'on veut pouvoir affirmer. */
    assert.strictEqual(bonnesReponsesMin(3, 7), 7);
    assert.strictEqual(bonnesReponsesMin(2, 7), 5, '5/7 = 0,714 ≥ 0,7 ; 4/7 ne passe pas');
    assert.strictEqual(bonnesReponsesMin(1, 10), 5);
    assert.strictEqual(bonnesReponsesMin(3, 10), 9);
    assert.strictEqual(bonnesReponsesMin(0, 7), 0, 'zéro étoile ne garantit rien');
});

test('LE BARÈME RECOPIÉ EST LE MÊME QUE CELUI DU JEU', () => {
    /* Le jeu CALCULE les étoiles côté navigateur et n'envoie que le résultat : le serveur ne
       peut que recopier le barème. Un second exemplaire dérive — celui-ci est donc confronté au
       source de PizzaQuest.jsx, qui fait foi. */
    const { SEUILS } = require('../lib/questUsage.js');
    const jeu = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui/pages/PizzaQuest.jsx'), 'utf8');
    const m = jeu.match(/ratio >= ([\d.]+) \? 3 : ratio >= ([\d.]+) \? 2 : ratio >= ([\d.]+) \? 1/);
    assert.ok(m, 'le barème doit rester lisible dans PizzaQuest.jsx');
    assert.deepStrictEqual([SEUILS[3], SEUILS[2], SEUILS[1]], m.slice(1, 4).map(Number),
        'le barème du serveur a dérivé de celui du jeu');
});

test('UNE SESSION DIT QUI A JOUÉ, ET QUI N\'A PAS JOUÉ', () => {
    const s = parSession([
        { learner_id: 'a', world: 'RS7404', step: '0', stars: 3 },  // La farine, 3 questions
        { learner_id: 'a', world: 'RS7404', step: '1', stars: 2 },  // Le four, 2 questions
        { learner_id: 'b', world: 'RS7404', step: '0', stars: 1 },
    ]);
    assert.strictEqual(s.stagiaires, 3);
    assert.strictEqual(s.joueurs, 2, 'MARQUEZ Miguel est inscrit mais n\'a pas joué');
    assert.strictEqual(s.termines, 3);
    /* La complétion du GROUPE : 3 chapitres terminés sur 3 inscrits × 2 chapitres jouables. */
    assert.strictEqual(s.completion, 50);
    const jeremy = s.apprenants.find((a) => a.nom === 'HANY Jérémy');
    assert.strictEqual(jeremy.completion, 100, 'il a terminé les deux chapitres jouables');
    assert.strictEqual(jeremy.questions, 5);
    assert.strictEqual(jeremy.bonnesMin, 3 + 2, '⌈0,9×3⌉ = 3 puis ⌈0,7×2⌉ = 2');
    const miguel = s.apprenants.find((a) => a.nom === 'MARQUEZ Miguel');
    assert.strictEqual(miguel.termines, 0);
    assert.strictEqual(miguel.completion, 0, 'zéro, et non « — » : il avait quelque chose à faire');
});

test('LA COMPLÉTION DU GROUPE SE COMPTE EN TRAVAIL, PAS EN MOYENNE DE TAUX', () => {
    /* PREMIÈRE VERSION DE CE TEST : FAUSSE, et corrigée ici. Elle affirmait que les deux
       lectures divergent. Elles ne divergent PAS — dans une session, tout le monde suit la même
       formation, donc le même dénominateur, et « travail fait ÷ travail à faire » est
       arithmétiquement identique à la moyenne des taux individuels. Le test l'a montré :
       17 % des deux côtés.

       POURQUOI GARDER LA FORMULE DU GROUPE, alors. Parce qu'elle reste juste quand l'autre ne
       l'est plus : un stagiaire dont la formation n'a AUCUN chapitre n'a pas de taux (null, et
       surtout pas 0 %), et le faire entrer dans une moyenne demanderait de choisir entre
       l'ignorer — ce qui gonfle le résultat — ou le compter zéro, ce qui punit le groupe pour
       une banque vide. Compter le travail évite la question. */
    const s = parSession([{ learner_id: 'a', world: 'RS7404', step: '0', stars: 3 }]);
    assert.strictEqual(s.termines, 1);
    assert.strictEqual(s.completion, Math.round((1 / (3 * 2)) * 100), '1 chapitre sur 3 × 2 à faire');
    const moyenneDesTaux = Math.round(s.apprenants.reduce((t, a) => t + (a.completion || 0), 0) / s.apprenants.length);
    assert.strictEqual(s.completion, moyenneDesTaux,
        'à dénominateur égal les deux coïncident — c\'est le cas normal, et il fallait le vérifier');
    /* LE CAS OÙ ELLES DIVERGERAIENT : un taux individuel inexistant. La formule du groupe le
       traverse sans broncher ; une moyenne, non. */
    const vide = usageQuest({ programs: [{ id: 'pX', code: 'VIDE', title: 'Sans banque' }], bank: BANK,
        progress: [], sessions: [{ id: 'sX', program_id: 'pX', year: 2026, week: 1, status: 'TERMINEE' }],
        enrollments: [{ learner_id: 'a', session_id: 'sX' }], apprenants: NOMS }).parSession[0];
    assert.strictEqual(vide.apprenants[0].completion, null, 'aucun taux individuel à moyenner');
    assert.strictEqual(vide.completion, null);
});

test('CE QUI EST JOUÉ HORS DE SA FORMATION EST COMPTÉ À PART', () => {
    /* Rien n'empêche un stagiaire de jouer un autre monde, et c'est bon signe. Mais mêler ces
       parties à sa session ferait dépasser 100 % de complétion sans qu'on comprenne pourquoi. */
    const s = parSession([
        { learner_id: 'a', world: 'RS7404', step: '0', stars: 3 },
        { learner_id: 'a', world: 'AUTRE', step: '0', stars: 3 },
    ]);
    const jeremy = s.apprenants.find((a) => a.id === 'a');
    assert.strictEqual(jeremy.termines, 1, 'seule sa formation compte dans la complétion');
    assert.strictEqual(jeremy.horsFormation, 1);
    assert.ok(jeremy.completion <= 100);
    assert.strictEqual(s.joueurs, 1, 'mais il compte bien comme joueur');
});

test('UNE SESSION SANS BANQUE NE PROMET PAS 100 %', () => {
    /* Zéro sur zéro n'est pas « tout fait » : sans chapitre, la complétion n'existe pas. Le
       défaut symétrique de celui que `cadresQuest` gèle déjà pour les cadres. */
    const s = usageQuest({ programs: [{ id: 'pX', code: 'VIDE', title: 'Sans banque' }], bank: BANK,
        progress: [], sessions: [{ id: 'sX', program_id: 'pX', year: 2026, week: 1, status: 'TERMINEE' }],
        enrollments: [{ learner_id: 'a', session_id: 'sX' }], apprenants: NOMS }).parSession[0];
    assert.strictEqual(s.chapitres, 0);
    assert.strictEqual(s.completion, null, 'pas de complétion, surtout pas 100 %');
    assert.strictEqual(s.apprenants[0].completion, null);
});

test('LA DERNIÈRE PARTIE D\'UNE SESSION EST LA PLUS RÉCENTE DES SIENNES', () => {
    const s = parSession([
        { learner_id: 'a', world: 'RS7404', step: '0', stars: 3, updated_at: '2026-09-10 08:00' },
        { learner_id: 'b', world: 'RS7404', step: '0', stars: 1, updated_at: '2026-09-15 19:42' },
    ]);
    assert.strictEqual(s.derniere, '2026-09-15 19:42');
    /* Comparée en CHAÎNE, format « AAAA-MM-JJ hh:mm » : aucune date n'est reconstruite en JS,
       où elle repartirait dans le fuseau du processus. C'est la parade déjà retenue ailleurs. */
    assert.strictEqual(typeof s.derniere, 'string');
});
