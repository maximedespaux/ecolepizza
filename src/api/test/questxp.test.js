// XP de Pizza Quest calculé à partir des questions (module front, fonctions pures).
//
// Point sensible : le « +X XP » annoncé à la fin d'un chapitre et le total affiché en en-tête
// doivent sortir de la MÊME formule. S'ils divergent, le stagiaire voit son total augmenter
// d'autre chose que ce qu'on lui a promis — c'est ce qu'on verrouille ici.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../app/ui/lib/questxp.js');

const chap = (...xps) => ({ questions: xps.map((xp) => ({ xp })) });

test('xpOfQuestion : valeur propre, sinon socle de 10', async () => {
    const { xpOfQuestion, XP_DEFAUT } = await load();
    assert.equal(xpOfQuestion({ xp: 25 }), 25);
    assert.equal(xpOfQuestion({ xp: 0 }), 0);          // 0 est une valeur, pas une absence
    assert.equal(xpOfQuestion({}), XP_DEFAUT);
    assert.equal(xpOfQuestion({ xp: -5 }), XP_DEFAUT); // valeur aberrante ignorée
});

test('xpOfQuestion : null vaut « non renseigné », surtout pas zéro', async () => {
    // Piège : Number(null) === 0. Une question qui s'en remet à sa difficulté (xp NULL en
    // base) ne rapporterait alors plus rien.
    const { xpOfQuestion, XP_DEFAUT } = await load();
    assert.equal(xpOfQuestion({ xp: null }), XP_DEFAUT);
    assert.equal(xpOfQuestion({ xp: '' }), XP_DEFAUT);
});

test('chapterXpMax : somme des questions', async () => {
    const { chapterXpMax } = await load();
    assert.equal(chapterXpMax(chap(10, 20, 5)), 35);
    assert.equal(chapterXpMax({ questions: [] }), 0);
    assert.equal(chapterXpMax(null), 0);
});

test('chapterXpEarned : proportionnel aux étoiles', async () => {
    const { chapterXpEarned } = await load();
    const c = chap(10, 20, 30); // 60 au total
    assert.equal(chapterXpEarned(c, 3), 60);
    assert.equal(chapterXpEarned(c, 2), 40);
    assert.equal(chapterXpEarned(c, 1), 20);
    assert.equal(chapterXpEarned(c, 0), 0);
});

test('chapterXpEarned : borné à 3 étoiles et jamais négatif', async () => {
    const { chapterXpEarned } = await load();
    const c = chap(10, 10, 10);
    assert.equal(chapterXpEarned(c, 99), 30);
    assert.equal(chapterXpEarned(c, -2), 0);
});

test('worldXp : additionne les chapitres terminés', async () => {
    const { worldXp } = await load();
    const chapters = [chap(10, 10), chap(30, 30)]; // 20 puis 60
    assert.equal(worldXp(chapters, { 0: 3, 1: 3 }), 80);
    assert.equal(worldXp(chapters, { 0: 3 }), 20);
    assert.equal(worldXp(chapters, {}), 0);
});

test('worldXp : chapitre inconnu -> ancien barème étoiles × 10', async () => {
    const { worldXp } = await load();
    // La banque a changé et l'index 5 n'existe plus : l'XP acquis ne doit pas s'évaporer.
    assert.equal(worldXp([chap(10)], { 5: 2 }), 20);
});

test('cohérence : le total d’un monde vaut la somme des « +X XP » annoncés', async () => {
    const { worldXp, chapterXpEarned } = await load();
    const chapters = [chap(10, 20), chap(5, 5, 5)];
    const prog = { 0: 2, 1: 3 };
    const annonce = chapterXpEarned(chapters[0], 2) + chapterXpEarned(chapters[1], 3);
    assert.equal(worldXp(chapters, prog), annonce);
});
