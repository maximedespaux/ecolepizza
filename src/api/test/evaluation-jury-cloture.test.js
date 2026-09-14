/**
 * LA CLÔTURE, ET CE QUE LE DOCUMENT DU JURY IMPRIME.
 *
 * LA CLÔTURE EST LE SEUL GESTE IRRÉVERSIBLE de la fonctionnalité : après elle, la grille ne
 * bouge plus et le document part à la signature. Ce qu'elle REFUSE compte donc autant que ce
 * qu'elle fait — un document faux mais signé devient opposable.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminDb = require.resolve('../config/database.js');

/* Une grille à deux compétences : C1 exige ses deux critères, C2 en exige un sur deux. */
const EXERCICES = [
    { id: 'x1', competence_id: 'k1', label: 'C1.1 - Farine', bareme: 'BINAIRE', max_points: 1, active: 1, obligatoire: 0 },
    { id: 'x2', competence_id: 'k1', label: 'C1.2 - Sel', bareme: 'BINAIRE', max_points: 1, active: 1, obligatoire: 0 },
    { id: 'x3', competence_id: 'k2', label: 'C2.1 - Boulage', bareme: 'BINAIRE', max_points: 1, active: 1, obligatoire: 1 },
    { id: 'x4', competence_id: 'k2', label: 'C2.2 - Temps', bareme: 'BINAIRE', max_points: 1, active: 1, obligatoire: 0 },
];
const COMPETENCES = [
    { id: 'k1', code: 'C1', label: 'Fabriquer une pâte', min_valides: null, active: 1 },
    { id: 'k2', code: 'C2', label: 'Bouler', min_valides: 1, active: 1 },
];

let notes = [];
let verdict = null;
let prepareAppele = null;
const faux = {
    promise: () => ({
        query: async (sql) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            if (/FROM enrollment e\s+JOIN training_session/i.test(sql)) return [[{ id: 'enr-1', program_id: 'p-1' }]];
            if (/FROM evaluation_grille/i.test(sql)) return [[{ id: 'g-1', program_id: 'p-1', role: 'JURY', label: 'Grille jury', pass_score: null, template_slug: 'grille-jury', active: 1 }]];
            if (/FROM evaluation_exercice/i.test(sql)) return [EXERCICES];
            if (/FROM evaluation_competence/i.test(sql)) return [COMPETENCES];
            if (/FROM evaluation_note WHERE enrollment_id/i.test(sql)) return [notes];
            if (/FROM evaluation_verdict/i.test(sql)) return [verdict ? [verdict] : []];
            if (/JOIN session_intervenant si/i.test(sql)) return [[{ first_name: 'Pascal', last_name: 'RIOS', specialty: 'Jury' }]];
            if (/SELECT learner_id FROM enrollment/i.test(sql)) return [[{ learner_id: 'l-1' }]];
            if (/^\s*UPDATE evaluation_verdict/i.test(sql)) return [{}];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

/* `prepareLearnerDoc` est chargé paresseusement par la clôture : on le remplace par un témoin
   plutôt que de fabriquer un vrai document. */
const cheminDoc = require.resolve('../controllers/document.controller.js');
require.cache[cheminDoc] = {
    id: cheminDoc, filename: cheminDoc, loaded: true,
    exports: { prepareLearnerDoc: async (conn, org, opts) => { prepareAppele = opts; return 'doc-1'; } },
};

const { cloturerCandidat, resultatJuryDossier } = require('../controllers/evaluation.controller.js');
const { resolveTokens, RAW_TOKENS } = require('../lib/tokens.js');

const conn = faux.promise();
const coche = (obj) => Object.entries(obj).map(([exercice_id, points]) => ({ exercice_id, points, valeur: points ? 'OUI' : 'NON', commentaire: null }));

test('ON NE CLÔTURE PAS UNE GRILLE INCOMPLÈTE', async () => {
    /* LE REFUS QUI COMPTE. Un document qui annonce « 1 compétence sur 2 » alors que la seconde
       n'a pas été regardée est FAUX, et il est signé : l'erreur devient opposable. Le jury voit
       ce qui manque et y retourne. */
    notes = coche({ x1: 1, x2: 1 });
    verdict = { avis: 'FAVORABLE', rattrapage: 0, observations: null, cloture_le: null };
    const r = await cloturerCandidat(conn, 'o1', 'u1', 'enr-1');
    assert.strictEqual(r.code, 422);
    assert.match(r.erreur, /C2/, 'le refus doit NOMMER ce qui manque, sinon il faut chercher');
});

test('ON NE CLÔTURE PAS SANS AVIS', async () => {
    /* Le compte se calcule, l'avis se prononce. Un document sans avis ne dit pas ce que le jury
       a décidé — et c'est pourtant la seule ligne que le candidat lira. */
    notes = coche({ x1: 1, x2: 1, x3: 1, x4: 0 });
    verdict = { avis: null, rattrapage: 0, observations: null, cloture_le: null };
    const r = await cloturerCandidat(conn, 'o1', 'u1', 'enr-1');
    assert.strictEqual(r.code, 422);
    assert.match(r.erreur, /avis/i);
});

test('grille complète et avis prononcé : la clôture produit le document', async () => {
    notes = coche({ x1: 1, x2: 1, x3: 1, x4: 0 });
    verdict = { avis: 'FAVORABLE', rattrapage: 0, observations: null, cloture_le: null };
    prepareAppele = null;
    const r = await cloturerCandidat(conn, 'o1', 'u1', 'enr-1');
    assert.strictEqual(r.erreur, undefined, JSON.stringify(r));
    assert.strictEqual(r.documentId, 'doc-1');
    assert.strictEqual(prepareAppele.templateSlug, 'grille-jury');
    assert.deepStrictEqual(prepareAppele.enrollmentIds, ['enr-1']);
    assert.strictEqual(r.resultat.validees, 2, 'C2 passe avec un critère sur deux, son obligatoire étant acquis');
});

test('une évaluation déjà clôturée ne se reclôture pas', async () => {
    notes = coche({ x1: 1, x2: 1, x3: 1, x4: 1 });
    verdict = { avis: 'FAVORABLE', rattrapage: 0, observations: null, cloture_le: '03/07/2026' };
    const r = await cloturerCandidat(conn, 'o1', 'u1', 'enr-1');
    assert.strictEqual(r.code, 409);
});

/* ---------------------------------------------------------------------------------------- */

test('SANS GRILLE DE JURY, les jetons sont vides', () => {
    /* Même raison que les jetons du formateur : « 0 / 7 — Non validée » sur le document d'une
       formation sans jury dirait le contraire du vrai. */
    for (const cas of [undefined, null, { grille: null }, { grille: {}, competences: [] }]) {
        const v = resolveTokens({ jury: cas });
        assert.strictEqual(v['JuryCompétences'], '');
        assert.strictEqual(v.JuryAvis, '');
        assert.strictEqual(v['JuryCritères'], '');
    }
});

test('LA GRILLE IMPRIMÉE DIT « — » POUR UN CRITÈRE NON VU, jamais « NON »', async () => {
    /* La distinction est celle de toute la fonctionnalité : le jury ne l'a pas refusé, il ne
       l'a pas regardé. Imprimer « NON » ferait porter au candidat un échec que personne n'a
       prononcé — sur un document signé. */
    notes = coche({ x1: 1, x3: 0 });
    verdict = { avis: null, rattrapage: 0, observations: null, cloture_le: null };
    const jv = await resultatJuryDossier(conn, 'o1', 'enr-1');
    const html = resolveTokens({ jury: jv })['JuryCritères'];
    assert.match(html, /C1\.1 - Farine<\/td><td>OUI/);
    assert.match(html, /C2\.1 - Boulage<\/td><td>NON/);
    assert.match(html, /C1\.2 - Sel<\/td><td>—/, 'un critère non coché n\'est pas un critère raté');
});

test('« Non » S\'IMPRIME, une case blanche non', async () => {
    /* Une case vide sur un document signé se lit comme un oubli, pas comme un refus de
       rattrapage. Tant que le jury n'a rien prononcé, en revanche, on n'écrit rien. */
    notes = coche({ x1: 1, x2: 1, x3: 1, x4: 1 });
    verdict = { avis: 'FAVORABLE', rattrapage: 0, observations: null, cloture_le: '03/07/2026' };
    const avec = resolveTokens({ jury: await resultatJuryDossier(conn, 'o1', 'enr-1') });
    assert.strictEqual(avec.JuryRattrapage, 'Non');
    assert.strictEqual(avec.JuryAvis, 'Favorable');
    assert.strictEqual(avec['JuryCompétences'], '2 / 2');

    verdict = { avis: null, rattrapage: 0, observations: null, cloture_le: null };
    const sans = resolveTokens({ jury: await resultatJuryDossier(conn, 'o1', 'enr-1') });
    assert.strictEqual(sans.JuryRattrapage, '', 'rien n\'a été prononcé : on n\'écrit rien');
});

test('les membres du jury ont CHACUN leur case de signature', async () => {
    /* Le règlement d'examen fait signer chaque membre : une case unique pour « le jury »
       laisserait croire qu'un seul a évalué. */
    notes = coche({ x1: 1, x2: 1, x3: 1, x4: 1 });
    verdict = { avis: 'FAVORABLE', rattrapage: 0, observations: null, cloture_le: '03/07/2026' };
    const html = resolveTokens({ jury: await resultatJuryDossier(conn, 'o1', 'enr-1') }).JuryMembres;
    assert.match(html, /RIOS Pascal/);
    assert.match(html, /<th>Signature<\/th>/);
});

test('les tableaux du jury sont injectés en HTML', () => {
    /* Hors de RAW_TOKENS, le candidat lirait « <table><tr><td>… » au milieu de sa grille. */
    for (const k of ['JuryDétail', 'JuryCritères', 'JuryMembres']) assert.ok(RAW_TOKENS.has(k), k);
});

/* ---------------------------------------------------------------------------------------- */

const TPL = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');

test('POSER LES MODÈLES N\'ÉCRASE JAMAIS CE QUI EXISTE', () => {
    /* Le corps livré n'est qu'un point de départ ; l'organisme le retouche ensuite. Un second
       clic — par curiosité, ou parce qu'on ne sait plus s'il a été cliqué — effacerait sa mise
       en page sans rien demander. */
    const bloc = TPL.slice(TPL.indexOf('const poserModelesJury'));
    const corps = bloc.slice(0, bloc.indexOf('\n};'));
    assert.match(corps, /if \(deja\.has\(m\.slug\)\) continue;/,
        'un modèle déjà présent doit être sauté, pas réécrit');
    assert.match(corps, /poses, deja/, 'et le bouton doit dire ce qu\'il a fait');
});

test('le modèle livré porte les jetons du jury, pas du texte figé', () => {
    const { GRILLE_JURY } = require('../lib/modelesJury.js');
    for (const k of ['JuryCritères', 'JuryCompétences', 'JuryAvis', 'JuryMembres', 'JuryDate']) {
        assert.ok(GRILLE_JURY.body.includes(`data-token="${k}"`), `le modèle doit porter {${k}}`);
    }
    assert.deepStrictEqual(GRILLE_JURY.signers, ['STAGIAIRE', 'ORG']);
});
