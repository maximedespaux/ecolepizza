/**
 * BARÈMES D'ÉVALUATION PRATIQUE — la conversion d'une mesure en points.
 *
 * POURQUOI CE FICHIER EST LE PLUS FOURNI DE LA FONCTIONNALITÉ. La conversion est la seule partie
 * qui puisse se tromper en SILENCE. Un palier mal choisi ne lève aucune erreur : il donne 50
 * points au lieu de 100, la grille s'affiche normalement, et personne ne s'en aperçoit avant
 * qu'un stagiaire conteste sa note — des semaines plus tard, quand l'attestation est partie.
 *
 * LES CAS LIMITES SONT LA MATIÈRE, pas l'ornement : la borne exacte d'un palier, la durée qui ne
 * tombe dans aucun, l'exercice pas encore passé. Ce sont eux qui séparent une note juste d'une
 * note plausible.
 */
const test = require('node:test');
const assert = require('node:assert');

const {
    maximumExercice, pointsPour, dureeLisible, totalGrille, reussite, lirePaliers,
} = require('../lib/bareme.js');

/* La grille de l'exemple donné : moins d'une minute vaut 100, entre une et deux minutes 50,
   au-delà rien. */
const CHRONO = {
    id: 'ex-chrono', bareme: 'TEMPS', max_points: 100, active: 1,
    paliers: JSON.stringify([
        { max_s: 60, points: 100 },
        { max_s: 120, points: 50 },
        { max_s: null, points: 0 },
    ]),
};
const NOTE20 = { id: 'ex-note', bareme: 'POINTS', max_points: 20, active: 1 };
const GESTE = { id: 'ex-geste', bareme: 'BINAIRE', max_points: 10, active: 1 };
const NIVEAU = {
    id: 'ex-niv', bareme: 'NIVEAUX', max_points: 0, active: 1,
    paliers: [
        { label: 'Insuffisant', points: 0 },
        { label: 'En cours', points: 5 },
        { label: 'Acquis', points: 10 },
        { label: 'Maîtrisé', points: 15 },
    ],
};

/* ─────────────────────────────── TEMPS ─────────────────────────────── */

test('un temps tombe dans le palier qui le couvre', () => {
    assert.strictEqual(pointsPour(CHRONO, 45).points, 100);
    assert.strictEqual(pointsPour(CHRONO, 90).points, 50);
    assert.strictEqual(pointsPour(CHRONO, 300).points, 0);
});

test('LA BORNE APPARTIENT À SON PALIER', () => {
    /* « Moins d'une minute » se dit `max_s: 60`, et une performance de 60 secondes exactement
       doit valoir 100. La borne stricte est le piège classique : elle fait perdre cinquante
       points à qui a fait pile le temps demandé, et cela ne se voit qu'au chronomètre. */
    assert.strictEqual(pointsPour(CHRONO, 60).points, 100, '60 s pile = palier « moins d\'une minute »');
    assert.strictEqual(pointsPour(CHRONO, 61).points, 50, '61 s = palier suivant');
    assert.strictEqual(pointsPour(CHRONO, 120).points, 50, '120 s pile = palier « deux minutes »');
    assert.strictEqual(pointsPour(CHRONO, 121).points, 0);
});

test('les paliers sont TRIÉS avant d\'être parcourus', () => {
    /* Ils se saisissent à la main : une ligne ajoutée après coup arrive en dernier dans le
       tableau. Sans tri, le premier palier rencontré gagnerait — ici « 120 s = 50 » attraperait
       une performance de 30 secondes qui vaut 100. */
    const desordre = {
        bareme: 'TEMPS', max_points: 100,
        paliers: [{ max_s: 120, points: 50 }, { max_s: null, points: 0 }, { max_s: 60, points: 100 }],
    };
    assert.strictEqual(pointsPour(desordre, 30).points, 100);
    assert.strictEqual(pointsPour(desordre, 90).points, 50);
    assert.strictEqual(pointsPour(desordre, 999).points, 0);
});

test('une durée qu\'aucun palier ne couvre vaut ZÉRO, pas « non noté »', () => {
    /* Le formateur a bien mesuré quelque chose : l'exercice est passé, et raté. Le rendre
       « non noté » le ferait disparaître du total, ce qui AVANTAGERAIT la contre-performance. */
    const borne = { bareme: 'TEMPS', max_points: 100, paliers: [{ max_s: 60, points: 100 }] };
    assert.strictEqual(pointsPour(borne, 300).points, 0);
});

test('une durée absurde ou absente ne se devine pas', () => {
    assert.strictEqual(pointsPour(CHRONO, '').points, null);
    assert.strictEqual(pointsPour(CHRONO, null).points, null);
    assert.strictEqual(pointsPour(CHRONO, -5).points, null, 'un temps négatif est une faute de saisie');
    assert.strictEqual(pointsPour(CHRONO, 'vite').points, null);
});

/* ─────────────────────────────── POINTS ─────────────────────────────── */

test('une note directe est bornée des DEUX côtés', () => {
    assert.strictEqual(pointsPour(NOTE20, 15).points, 15);
    assert.strictEqual(pointsPour(NOTE20, 25).points, 20, 'au-delà du maximum, on borne');
    assert.strictEqual(pointsPour(NOTE20, -3).points, 0, 'une note négative viendrait d\'une faute de frappe');
    assert.strictEqual(pointsPour(NOTE20, 0).points, 0, 'zéro est une NOTE, pas une absence');
});

/* ─────────────────────────────── BINAIRE ─────────────────────────────── */

test('un geste acquis vaut le maximum, non acquis vaut zéro', () => {
    for (const oui of [true, 'OUI', 'oui', '1', 'ACQUIS']) {
        assert.strictEqual(pointsPour(GESTE, oui).points, 10, `« ${oui} » doit valoir acquis`);
    }
    for (const non of ['NON', '0', false, 'autre chose']) {
        assert.strictEqual(pointsPour(GESTE, non).points, 0, `« ${non} » doit valoir non acquis`);
        assert.notStrictEqual(pointsPour(GESTE, non).points, null,
            'une valeur PRÉSENTE ne doit jamais rendre « non noté » : l\'exercice sortirait du total');
    }
});

/* ─────────────────────────────── NIVEAUX ─────────────────────────────── */

test('une appréciation vaut les points de son niveau', () => {
    assert.strictEqual(pointsPour(NIVEAU, 0).points, 0);
    assert.strictEqual(pointsPour(NIVEAU, 2).points, 10);
    assert.strictEqual(pointsPour(NIVEAU, 3).points, 15);
    assert.strictEqual(pointsPour(NIVEAU, 2).libelle, 'Acquis');
});

test('le niveau est repéré par son INDEX, pas par son libellé', () => {
    /* Renommer « Acquis » en « Maîtrisé » ne doit pas effacer les notes déjà saisies. Stocker le
       libellé rendrait toute correction de vocabulaire destructrice. */
    assert.strictEqual(pointsPour(NIVEAU, 2).points, 10);
    const renomme = { ...NIVEAU, paliers: NIVEAU.paliers.map((p, i) => (i === 2 ? { ...p, label: 'Maîtrisé' } : p)) };
    assert.strictEqual(pointsPour(renomme, 2).points, 10, 'la note survit au renommage');
});

test('un index hors des niveaux ne vaut pas zéro', () => {
    /* Un niveau supprimé laisse des notes qui pointent dans le vide. Les compter zéro
       abaisserait des totaux déjà communiqués ; « non noté » les sort du calcul, ce qui se voit. */
    assert.strictEqual(pointsPour(NIVEAU, 9).points, null);
    assert.strictEqual(pointsPour(NIVEAU, -1).points, null);
});

/* ─────────────────────────────── MAXIMUM ─────────────────────────────── */

test('le maximum d\'un barème à paliers vient des PALIERS, pas du champ déclaré', () => {
    /* Sinon la grille annoncerait un total sur 120 quand nul ne peut dépasser 100, et le seuil
       de réussite porterait sur un maximum imaginaire. */
    assert.strictEqual(maximumExercice(CHRONO), 100);
    assert.strictEqual(maximumExercice({ ...CHRONO, max_points: 999 }), 100);
    assert.strictEqual(maximumExercice(NIVEAU), 15, 'le meilleur niveau fait le maximum');
    assert.strictEqual(maximumExercice(NOTE20), 20, 'en saisie directe, le champ déclaré fait foi');
});

test('des paliers illisibles ne font pas tomber le calcul', () => {
    /* Le champ est du JSON en base : une saisie manuelle malheureuse ne doit pas rendre la
       grille inutilisable pour tout le monde. */
    assert.deepStrictEqual(lirePaliers('pas du json'), []);
    assert.deepStrictEqual(lirePaliers(null), []);
    assert.strictEqual(maximumExercice({ bareme: 'TEMPS', max_points: 42, paliers: 'cassé' }), 42);
});

/* ─────────────────────────────── TOTAL ─────────────────────────────── */

test('le total ne rapporte qu\'aux exercices NOTÉS', () => {
    /* LE PIÈGE PRINCIPAL. Rapporter un total partiel au maximum de toute la grille afficherait
       20 % à qui a tout réussi sur le premier tiers du stage — et le seuil refuserait quelqu'un
       qui n'a simplement pas fini. */
    const exercices = [CHRONO, NOTE20, GESTE];
    const t = totalGrille(exercices, { 'ex-chrono': 100 });
    assert.strictEqual(t.points, 100);
    assert.strictEqual(t.max, 100, 'seul l\'exercice noté entre dans le maximum');
    assert.strictEqual(t.percent, 100);
    assert.strictEqual(t.notes, 1);
    assert.strictEqual(t.total, 3);
    assert.strictEqual(t.complet, false);
});

test('tout noté : le total porte sur la grille entière', () => {
    const t = totalGrille([CHRONO, NOTE20, GESTE], { 'ex-chrono': 50, 'ex-note': 10, 'ex-geste': 0 });
    assert.strictEqual(t.points, 60);
    assert.strictEqual(t.max, 130);
    assert.strictEqual(t.percent, 46);
    assert.strictEqual(t.complet, true);
});

test('un exercice désactivé sort de la grille', () => {
    /* On désactive plutôt que de supprimer, pour ne pas perdre les notes déjà saisies — mais il
       ne doit plus peser sur les totaux à venir. */
    const t = totalGrille([CHRONO, { ...NOTE20, active: 0 }], { 'ex-chrono': 100, 'ex-note': 20 });
    assert.strictEqual(t.max, 100);
    assert.strictEqual(t.total, 1);
});

test('un zéro compte, une absence non', () => {
    const t = totalGrille([NOTE20, GESTE], { 'ex-note': 0 });
    assert.strictEqual(t.notes, 1, 'zéro est une note');
    assert.strictEqual(t.max, 20, 'l\'exercice non passé ne pèse pas');
});

/* ─────────────────────────────── RÉUSSITE ─────────────────────────────── */

test('sans seuil, on ne prononce rien', () => {
    assert.strictEqual(reussite({ pass_score: null }, totalGrille([NOTE20], { 'ex-note': 20 })), null);
});

test('on n\'annonce pas l\'échec avant la fin', () => {
    /* Un stagiaire à mi-parcours n'a pas échoué, il n'a pas fini. Afficher « échec » sur une
       grille incomplète serait faux, et démoralisant pour rien. */
    const partiel = totalGrille([CHRONO, NOTE20], { 'ex-chrono': 0 });
    assert.strictEqual(reussite({ pass_score: 70 }, partiel), null);
});

test('la réussite s\'annonce dès qu\'elle est acquise', () => {
    const partiel = totalGrille([CHRONO, NOTE20], { 'ex-chrono': 100 });
    assert.strictEqual(reussite({ pass_score: 70 }, partiel), true);
});

test('l\'échec se prononce quand tout est noté', () => {
    const complet = totalGrille([CHRONO, NOTE20], { 'ex-chrono': 0, 'ex-note': 5 });
    assert.strictEqual(reussite({ pass_score: 70 }, complet), false);
});

/* ─────────────────────────────── AFFICHAGE ─────────────────────────────── */

test('une durée se lit, elle ne se compte pas en secondes', () => {
    assert.strictEqual(dureeLisible(45), '45 s');
    assert.strictEqual(dureeLisible(60), '1 min');
    assert.strictEqual(dureeLisible(72), '1 min 12 s');
    assert.strictEqual(dureeLisible(605), '10 min 05 s', 'les secondes se complètent à deux chiffres');
    assert.strictEqual(dureeLisible(0), '0 s');
});
