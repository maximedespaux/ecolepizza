/**
 * LE PROCÈS-VERBAL DE JURY GÉNÉRÉ DEPUIS LE DOSSIER D'UN CANDIDAT.
 *
 * DÉFAUT CONSTATÉ LE 2026-09-18, sur la session RS7404 de la semaine 38 : la commission avait
 * délibéré (quatre candidats certifiés, trois membres, PV n° EPJJD-2026-38), et le modèle
 * `pv-jury` était posé dans les modèles de l'organisme. Généré depuis la fiche d'un stagiaire,
 * il sortait ENTIÈREMENT VIDE — pas de numéro, pas de date, pas un nom de juré, aucun candidat,
 * des comptes en blanc — alors que le même modèle rendu par le bouton « Éditer le PV » de la
 * commission était complet.
 *
 * LA CAUSE : les valeurs {PV…} n'étaient assemblées QUE par `contextePv`, dans le contrôleur des
 * examens. Un document de dossier passe, lui, par `loadContext` (document.controller), qui
 * chargeait l'organisme, le stagiaire, l'entreprise, les champs, l'évaluation, la grille du
 * jury… et RIEN de la commission. `ctx.exam` restait indéfini, et chaque jeton du PV rendait la
 * chaîne vide — silencieusement, ce qui est le pire : un document muet dont rien ne dit pourquoi.
 *
 * DEUX TESTS DE NATURE DIFFÉRENTE ICI, et les deux comptent :
 *   · les valeurs se remplissent vraiment, depuis la base, jusqu'aux jetons du modèle ;
 *   · AUCUNE clé de contexte lue par `lib/tokens.js` n'est laissée sans fournisseur. C'est
 *     l'invariant qui aurait attrapé ce défaut le jour où les jetons du PV ont été écrits.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : la commission de la RS7404, à la forme que rend le contrôleur ──────────────
const JURY = [
    { nom: 'DESPAUX Marie-Christine', qualite: 'présidente', externe: false, na_pas_forme: true },
    { nom: 'RIOS Pascal', qualite: 'membre du jury', externe: true, na_pas_forme: true },
    { nom: 'LE FAOU Dominique', qualite: 'membre du jury', externe: true, na_pas_forme: true },
];
const COMMISSION = {
    id: 'ex-1', training_session_id: 's-1', certification: 'Fabriquer des pizzas artisanales',
    rncp_code: 'RS7404', voie_acces: 'FORMATION_CONTINUE', pv_ref: 'EPJJD-2026-38',
    date_examen: '2026-09-18', lieu: '101 rue Alsace Lorraine', centre: '', status: 'CLOTUREE',
    jury: JSON.stringify(JURY), heure: '9h30',
    representant: 'DESPAUX Jean-Jacques', representant_fonction: 'Gérant', aleas: 'Néant.',
};
const CANDIDATS = [
    { learner_id: 'l-1', first_name: 'Jérémy', last_name: 'HANY', civility: 'M.', birthday: '12/04/1990' },
    { learner_id: 'l-2', first_name: 'Elodie', last_name: 'JOFFRE', civility: 'Mme', birthday: '03/11/1988' },
];
let resultats = [];
let commission = COMMISSION;
const faux = {
    promise: () => ({
        query: async (sql) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            if (/FROM exam_session/i.test(sql)) return [commission ? [commission] : []];
            if (/FROM exam_result/i.test(sql)) return [resultats];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [CANDIDATS];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { contexteExamen } = require('../controllers/examen.controller.js');
const { resolveTokens } = require('../lib/tokens.js');
const conn = faux.promise();

test('LE DOSSIER D\'UN CANDIDAT REÇOIT LA COMMISSION DE SA SESSION', async () => {
    resultats = [
        { learner_id: 'l-1', decision: 'CERTIFIE', observations: '' },
        { learner_id: 'l-2', decision: 'CERTIFIE', observations: '' },
    ];
    const ctx = await contexteExamen(conn, 'o1', 's-1', 'l-1');
    assert.strictEqual(ctx.exam.pv_ref, 'EPJJD-2026-38');
    assert.deepStrictEqual(ctx.exam.jury.map((m) => m.nom), JURY.map((m) => m.nom), 'le jury est décodé');
    assert.strictEqual(ctx.pvCandidats.length, 2, 'TOUS les candidats : le PV les liste, même dans un dossier');
    /* LA DÉCISION DU CANDIDAT NOMMÉ, et de lui seul. Sans elle, {Décision} resterait vide sur le
       document de la personne qu'il concerne — le seul jeton qu'elle lira. */
    assert.deepStrictEqual(ctx.examResult, { decision: 'CERTIFIE', observations: '' });
});

test('un candidat sans décision ne prend pas celle du voisin', async () => {
    resultats = [{ learner_id: 'l-1', decision: 'CERTIFIE', observations: '' }];
    const ctx = await contexteExamen(conn, 'o1', 's-1', 'l-2');
    assert.strictEqual(ctx.examResult, null, 'rien n\'a été décidé pour lui : on n\'invente pas');
    assert.strictEqual(ctx.pvCandidats.find((c) => c.learner_id === 'l-2').decision, 'EN_COURS');
});

test('LES JETONS DU MODÈLE SE REMPLISSENT, de la base au papier', async () => {
    /* Le chemin complet, avec les jetons que porte VRAIMENT le modèle `pv-jury` de l'organisme
       (relevés sur la production le 2026-09-18). Avant le correctif, tous rendaient « ». */
    resultats = [
        { learner_id: 'l-1', decision: 'CERTIFIE', observations: '' },
        { learner_id: 'l-2', decision: 'ABSENT', observations: '' },
    ];
    const v = resolveTokens(await contexteExamen(conn, 'o1', 's-1', 'l-1'));
    assert.strictEqual(v.PV, 'EPJJD-2026-38');
    assert.strictEqual(v['Date examen'], '18/09/2026');
    assert.strictEqual(v.PVHeure, '9h30');
    assert.strictEqual(v.Certification, 'Fabriquer des pizzas artisanales');
    assert.strictEqual(v['Code RNCP'], 'RS7404');
    assert.strictEqual(v['PVReprésentant'], 'DESPAUX Jean-Jacques');
    assert.match(v.PVJuryListe, /RIOS Pascal/);
    assert.match(v['Jury mention'], /2 membres sur 3 extérieurs/);
    assert.strictEqual(v.PVInscrits, '2');
    assert.strictEqual(v['PVPrésentés'], '1', 'l\'absent est inscrit, pas présenté');
    assert.strictEqual(v.PVAdmis, '1');
    assert.match(v.PVCandidats, /HANY/);
    // Et le jeton individuel, celui que le candidat cherche en premier.
    assert.strictEqual(v['Décision'], 'CERTIFICATION DÉLIVRÉE');
});

test('le PV de la commission lit exactement la même chose', async () => {
    /* `contextePv` — le bouton « Éditer le PV » — n'est plus qu'une enveloppe autour de la même
       fonction, avec l'organisme en plus. Deux lectures séparées finiraient par diverger, et
       deux PV de la même session ne diraient pas la même chose. */
    const { contextePv } = require('../controllers/examen.controller.js');
    resultats = [{ learner_id: 'l-1', decision: 'CERTIFIE', observations: '' }];
    const pv = await contextePv(conn, 'o1', 's-1');
    assert.deepStrictEqual(Object.keys(pv).sort(), ['exam', 'examResult', 'org', 'pvCandidats']);
    assert.strictEqual(pv.exam.pv_ref, 'EPJJD-2026-38');
    assert.strictEqual(pv.pvCandidats.length, 2);
    /* Le PV de session ne nomme personne : {Décision} y reste vide, comme avant. */
    assert.strictEqual(pv.examResult, null);
});

test('SANS COMMISSION, rien ne se remplit — et rien ne casse', async () => {
    /* Un contrat, un devis, une convocation passent par le même chargement. Une session sans
       commission ne doit pas les faire échouer, ni leur inventer un PV. */
    commission = null;
    assert.strictEqual(await contexteExamen(conn, 'o1', 's-1', 'l-1'), null);
    commission = COMMISSION;
});

// ── Le branchement côté documents ────────────────────────────────────────────────────────────
const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
const RETOUR = (() => {
    const d = CTRL.indexOf('return { org: org || {}, learner:');
    return CTRL.slice(d, CTRL.indexOf('};', d) + 1); // l'accolade fermante comprise : la dernière clé la touche
})();

test('LA SESSION VIENT DU DOCUMENT, pas du stagiaire', () => {
    /* Un stagiaire peut avoir suivi plusieurs sessions ; un PV appartient à UNE commission. On
       prend donc la session PORTÉE par le document (document de session), sinon celle de son
       dossier — jamais « la dernière session du stagiaire ». */
    assert.match(CTRL, /COALESCE\(gd\.session_id, e\.session_id\) AS session_id/);
    assert.match(CTRL, /WHERE gd\.id = \? AND gd\.organization_id = \?/,
        'un document ne lit jamais la commission d\'un autre organisme');
    assert.match(CTRL, /contexteExamen\(conn, organizationId, ds\.session_id, learnerId\)/,
        'le candidat est nommé : c\'est ce qui remplit {Décision} sur SON document');
    /* Requis à l'appel : `examen.controller` charge `template.controller`, qui charge ce
       fichier. Un require en tête laisserait l'un des deux modules à moitié construit. */
    assert.match(CTRL, /const \{ contexteExamen \} = require\('\.\/examen\.controller\.js'\);/);
});

test('AUCUNE CLÉ DE CONTEXTE LUE PAR LES JETONS N\'EST SANS FOURNISSEUR', () => {
    /* L'INVARIANT QUI AURAIT ÉVITÉ LE DÉFAUT. `lib/tokens.js` lit une quinzaine de clés sur le
       contexte ; le jour où trois d'entre elles ne sont remplies par personne sur le chemin des
       documents, les jetons correspondants rendent du vide sans un mot. Le test ne vérifie pas
       les valeurs — il vérifie qu'un fournisseur existe. */
    const TOKENS = fs.readFileSync(path.join(__dirname, '..', 'lib', 'tokens.js'), 'utf8');
    const lues = [...new Set([...TOKENS.matchAll(/\bctx\.([a-zA-Z_]+)/g)].map((m) => m[1]))];
    /* Les deux exceptions, nommées et justifiées — sinon la règle se contourne en silence :
       `signature` est posée sur le contexte par les appelants, APRÈS le chargement (c'est la
       signature apposée sur CE document) ; `invoice` appartient au chemin des factures
       (`invoice.controller`), qui ne passe pas par `loadContext`. */
    const AILLEURS = { signature: /ctx\.signature = \{ data: decrypt\(doc\.signature_data\)/, invoice: null };
    const sansFournisseur = lues.filter((cle) => {
        if (cle in AILLEURS) return AILLEURS[cle] ? !AILLEURS[cle].test(CTRL) : false;
        return !new RegExp(`(^|[{,])\\s*${cle}\\s*[:,}]`).test(RETOUR);
    });
    assert.deepStrictEqual(sansFournisseur, [], 'ces clés rendraient des jetons vides sans rien dire');
});
