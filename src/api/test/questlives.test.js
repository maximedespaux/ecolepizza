// Cœurs de Pizza Quest : régénération dans le temps.
//
// Le piège que ces tests verrouillent : quand on accorde des cœurs, le repère de temps doit
// être AVANCÉ des délais consommés, pas remis à « maintenant ». Sinon la fraction en cours
// est perdue à chaque lecture, et un stagiaire qui ouvre sa page toutes les minutes avec un
// délai de 5 minutes ne regagne jamais rien.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { etatCoeurs, retirerCoeur, reglages } = require('../lib/questlives.js');

const MIN = 60_000;
const T0 = Date.parse('2026-07-21T12:00:00Z');
const ligne = (hearts, updated_at) => ({ hearts, updated_at: new Date(updated_at) });
const ORG = { quest_max_hearts: 5, quest_regen_minutes: 5 };

/* ---- Réglages -------------------------------------------------------------------------- */

test('réglages : valeurs par défaut et bornes', () => {
    assert.deepEqual(reglages({}), { max: 5, delai: 5 });
    assert.deepEqual(reglages({ quest_max_hearts: 3, quest_regen_minutes: 20 }), { max: 3, delai: 20 });
    // Valeurs aberrantes en base : bornées plutôt que propagées.
    assert.equal(reglages({ quest_max_hearts: 999 }).max, 50);
    assert.equal(reglages({ quest_max_hearts: 0 }).max, 5);
    assert.equal(reglages({ quest_regen_minutes: 99999 }).delai, 1440);
});

test('réglages : délai 0 est une valeur, pas une absence', () => {
    // 0 = mécanique neutralisée ; ne doit pas retomber sur le défaut de 5 minutes.
    assert.equal(reglages({ quest_regen_minutes: 0 }).delai, 0);
});

/* ---- Lecture de l'état ----------------------------------------------------------------- */

test('sans ligne en base, le stagiaire est au maximum', () => {
    const e = etatCoeurs(null, ORG, T0);
    assert.equal(e.hearts, 5);
    assert.equal(e.nextInMs, 0);
});

test('délai écoulé : un cœur regagné par tranche', () => {
    assert.equal(etatCoeurs(ligne(2, T0), ORG, T0 + 4 * MIN).hearts, 2);   // pas encore
    assert.equal(etatCoeurs(ligne(2, T0), ORG, T0 + 5 * MIN).hearts, 3);
    assert.equal(etatCoeurs(ligne(2, T0), ORG, T0 + 12 * MIN).hearts, 4);  // 2 tranches
});

test('la régénération plafonne au maximum', () => {
    const e = etatCoeurs(ligne(0, T0), ORG, T0 + 10 * 60 * MIN);
    assert.equal(e.hearts, 5);
    assert.equal(e.nextInMs, 0);
    assert.equal(e.fullInMs, 0);
});

test('le repère avance des tranches consommées, il n’est pas remis à maintenant', () => {
    // 7 minutes après : 1 cœur accordé, et il reste 3 min avant le suivant — pas 5.
    const e = etatCoeurs(ligne(2, T0), ORG, T0 + 7 * MIN);
    assert.equal(e.hearts, 3);
    assert.equal(e.updatedAt.getTime(), T0 + 5 * MIN);
    assert.equal(e.nextInMs, 3 * MIN);
});

test('lectures répétées avant le seuil : le compteur ne repart pas de zéro', () => {
    // Le stagiaire consulte à 1, 2, 3, 4 min : toujours 2 cœurs, et le repère reste T0.
    for (const m of [1, 2, 3, 4]) {
        const e = etatCoeurs(ligne(2, T0), ORG, T0 + m * MIN);
        assert.equal(e.hearts, 2, `à ${m} min`);
        assert.equal(e.updatedAt.getTime(), T0, `repère à ${m} min`);
    }
    // À 5 min, le cœur tombe malgré les lectures intermédiaires.
    assert.equal(etatCoeurs(ligne(2, T0), ORG, T0 + 5 * MIN).hearts, 3);
});

test('nextInMs et fullInMs', () => {
    const e = etatCoeurs(ligne(2, T0), ORG, T0 + 2 * MIN);
    assert.equal(e.nextInMs, 3 * MIN);          // prochain cœur
    assert.equal(e.fullInMs, 3 * MIN + 2 * 5 * MIN); // puis 2 tranches pour atteindre 5
});

test('délai 0 : toujours au maximum', () => {
    const e = etatCoeurs(ligne(0, T0), { quest_max_hearts: 5, quest_regen_minutes: 0 }, T0);
    assert.equal(e.hearts, 5);
    assert.equal(e.nextInMs, 0);
});

test('valeur stockée hors bornes : ramenée dans l’intervalle', () => {
    assert.equal(etatCoeurs(ligne(99, T0), ORG, T0).hearts, 5);
    assert.equal(etatCoeurs(ligne(-3, T0), ORG, T0 + MIN).hearts, 0);
});

/* ---- Perte d'un cœur -------------------------------------------------------------------- */

test('retirer un cœur depuis le maximum démarre le compte à rebours', () => {
    const e = etatCoeurs(null, ORG, T0);            // 5/5
    const r = retirerCoeur(e, T0);
    assert.equal(r.hearts, 4);
    assert.equal(r.updatedAt.getTime(), T0);
});

test('perdre un cœur ne repousse pas la régénération en cours', () => {
    // 3 cœurs depuis 4 min : il reste 1 min avant le suivant. Perdre un cœur ne doit pas
    // remettre l'attente à 5 min — sinon échouer juste avant un crédit le fait fuir.
    const e = etatCoeurs(ligne(3, T0), ORG, T0 + 4 * MIN);
    const r = retirerCoeur(e, T0 + 4 * MIN);
    assert.equal(r.hearts, 2);
    assert.equal(r.updatedAt.getTime(), T0, 'le repère ne bouge pas');
    // Une minute plus tard, le cœur attendu tombe bien.
    assert.equal(etatCoeurs(ligne(r.hearts, r.updatedAt), ORG, T0 + 5 * MIN).hearts, 3);
});

test('on ne descend pas sous zéro', () => {
    const e = etatCoeurs(ligne(0, T0), ORG, T0);
    assert.equal(retirerCoeur(e, T0).hearts, 0);
});

test('enchaînement réaliste : trois échecs puis attente', () => {
    let etat = etatCoeurs(null, ORG, T0);                    // 5
    let cur = { hearts: etat.hearts, updated_at: etat.updatedAt };
    for (let i = 0; i < 3; i++) {                            // 3 échecs d'affilée
        const e = etatCoeurs(cur, ORG, T0);
        const r = retirerCoeur(e, T0);
        cur = { hearts: r.hearts, updated_at: r.updatedAt };
    }
    assert.equal(cur.hearts, 2);
    // 11 minutes plus tard : 2 cœurs regagnés, 1 min avant le suivant.
    const fin = etatCoeurs(cur, ORG, T0 + 11 * MIN);
    assert.equal(fin.hearts, 4);
    assert.equal(fin.nextInMs, 4 * MIN);
});
