/**
 * UN MONTANT TAPÉ EN FRANÇAIS S'ENREGISTRE — relevé par l'école le 2026-09-29 : la dépense
 * « Facture Métro n°007505 », 315,93 € HT, refusée — « Libellé et montant valides requis. » —
 * alors que tout était rempli.
 *
 * LE DÉFAUT : chaque route lisait le montant par `Number()`, qui ne connaît que le point.
 * `Number("315,93")` vaut NaN. Or les champs sont en `inputMode="decimal"`, et un clavier
 * français n'y propose QUE la virgule. Selon la route, la virgule était :
 *   · REFUSÉE — une dépense, une commission (et l'écran des apports disait « la valeur est
 *     obligatoire » sous une valeur bien remplie) ;
 *   · une ERREUR 500 — un apport en nature, NaN parti tel quel dans l'INSERT ;
 *   · IGNORÉE EN SILENCE — une cible, un dividende visé, la correction d'un montant : la réponse
 *     disait « enregistré », et l'ancienne valeur restait.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { lireMontant } = require('../lib/montantSaisi.js');
const { mergeTargets } = require('../lib/compta.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const PARTENAIRE = '22222222-2222-4222-8222-222222222222';

// ── Fausse base : réponses par motif, requêtes capturées ────────────────────────────────────────
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();
let requetes = [];
const reponses = [
    [/FROM partner WHERE id = \? AND organization_id = \?/, (q, params) => [params[0] === PARTENAIRE ? [{ ok: 1 }] : []]],
    [/^UPDATE revenue_extra/, [{ affectedRows: 1 }]],
    [/^SELECT id FROM accounting_settings/, [[]]],
    [/^INSERT/, [{ affectedRows: 1 }]],
];
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: async (sql, params) => {
        const q = plat(sql);
        requetes.push({ q, params });
        const r = reponses.find(([motif]) => motif.test(q));
        return r ? (typeof r[1] === 'function' ? r[1](q, params) : r[1]) : [[]];
    } }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };
const compta = require('../controllers/comptabilite.controller.js');
const partenaires = require('../controllers/partner.controller.js');

async function appeler(fn, body, params = {}) {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    requetes = [];
    await fn({ user: { organization_id: ORG, id: 'u1' }, body, params }, res);
    return res;
}
const ecrit = (motif) => requetes.find((r) => motif.test(r.q));

const CAS = [
    ['315,93', 315.93], ['315.93', 315.93], ['1 234,56', 1234.56], ['1\u00a0234,56', 1234.56],
    ['1\u202f234,56 €', 1234.56], ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['12', 12], ['5.', 5],
    [',5', 0.5], [42, 42], ['-5', -5],
    ['', NaN], ['abc', NaN], ['12,5,3', NaN], ['1e3', NaN], [null, NaN], [undefined, NaN],
];

test('LA RÈGLE : la virgule française, les espaces, et le dernier séparateur pour décimale', () => {
    for (const [saisie, attendu] of CAS) {
        const lu = lireMontant(saisie);
        if (Number.isNaN(attendu)) assert.ok(Number.isNaN(lu), `${JSON.stringify(saisie)} doit être refusé, lu ${lu}`);
        else assert.strictEqual(lu, attendu, JSON.stringify(saisie));
    }
});

test('L\'ÉCRAN LIT COMME LE SERVEUR : mêmes cas, mêmes réponses', async () => {
    const ecran = await import(pathToFileURL(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'montantSaisi.js')).href);
    for (const [saisie] of CAS) {
        assert.ok(Object.is(ecran.lireMontant(saisie), lireMontant(saisie)), `désaccord sur ${JSON.stringify(saisie)}`);
    }
});

test('LA DÉPENSE DU 12/09 : « 315,93 » s\'enregistre, et s\'écrit avec un point en base', async () => {
    const res = await appeler(compta.createExpense,
        { label: 'Facture Métro n°007505', categorie: 'MATIERES_PREMIERES', montantHT: '315,93', date: '2026-09-12' });
    assert.strictEqual(res.code, 201, JSON.stringify(res.corps));
    const insert = ecrit(/^INSERT INTO expense/);
    assert.strictEqual(insert.params[5], '315.93', 'la base garde le point (cf. montants-virgule.test.js)');
    // Et le refus reste là pour ce qui n'est pas un montant.
    const refus = await appeler(compta.createExpense, { label: 'x', categorie: 'DIVERS', montantHT: 'trois cents', date: '2026-09-12' });
    assert.strictEqual(refus.code, 422);
    assert.ok(!ecrit(/^INSERT INTO expense/), 'rien ne doit être écrit');
});

test('LES APPORTS : commission, correction, et apport en nature, en virgule', async () => {
    const commission = await appeler(compta.createRevenue,
        { label: 'Commission', categorie: 'COMMISSION', montant: '1 250,50', date: '2026-09-10', partner_id: PARTENAIRE });
    assert.strictEqual(commission.code, 201, JSON.stringify(commission.corps));
    assert.ok(ecrit(/^INSERT INTO revenue_extra/).params.includes('1250.50'));

    /* LA CORRECTION ne garde plus l'ancien montant en disant « mis à jour » : illisible, elle est
       refusée ; lisible, elle s'écrit. */
    const illisible = await appeler(compta.updateRevenue, { label: 'Commission', montant: 'douze' }, { id: 'r1' });
    assert.strictEqual(illisible.code, 422);
    assert.ok(!ecrit(/^UPDATE revenue_extra/), 'ni le libellé ni rien d\'autre ne doit partir');
    const corrige = await appeler(compta.updateRevenue, { montant: '315,93' }, { id: 'r1' });
    assert.strictEqual(corrige.code, 200, JSON.stringify(corrige.corps));
    assert.deepStrictEqual(ecrit(/^UPDATE revenue_extra/).params.slice(0, 1), ['315.93']);

    const nature = await appeler(partenaires.createContribution,
        { partner_id: PARTENAIRE, type: 'MATERIEL', label: 'Pétrin 20 L', value: '1 250,50', date: '2026-09-12' });
    assert.strictEqual(nature.code, 201, JSON.stringify(nature.corps));
    assert.strictEqual(ecrit(/^INSERT INTO partner_contribution/).params[6], '1250.50',
        'NaN partait dans l\'INSERT : une erreur 500');
    const refus = await appeler(partenaires.createContribution,
        { partner_id: PARTENAIRE, type: 'MATERIEL', label: 'Pétrin', value: 'beaucoup' });
    assert.strictEqual(refus.code, 422);
    assert.ok(!ecrit(/^INSERT INTO partner_contribution/));
});

test('LES CIBLES ET LE DIVIDENDE : « 12,5 » est retenu, et non ignoré en silence', async () => {
    assert.strictEqual(mergeTargets({ LOYER: '12,5' }).LOYER, 12.5);
    const res = await appeler(compta.saveTargets, { targets: { LOYER: '12,5' }, dividendeCible: '12,5' });
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps.data.dividendeCible, 12.5, 'il retombait sur 10 %, sans rien dire');
    assert.strictEqual(res.corps.data.targets.LOYER, 12.5);
});

test('L\'ÉCRAN : plus aucune saisie de montant lue par `Number()`', () => {
    const ui = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', f), 'utf8');
    const compta = ui('pages/Comptabilite.jsx');
    assert.match(compta, /const montant = lireMontant\(dep\.montantHT\)/);
    assert.match(compta, /createExpense\(\{ \.\.\.dep, montantHT: montant \}\)/);
    assert.match(compta, /lireMontant\(cibleForm\[c\.v\]\)/);
    assert.match(compta, /dividendeCible: lireMontant\(dividendeForm\)/);
    for (const f of ['components/PartnerContributions.jsx', 'pages/Partenaires.jsx']) {
        assert.doesNotMatch(ui(f), /Number\.isNaN\(Number\(form\.value\)\)/, `${f} : la virgule y passait pour une valeur absente`);
        assert.match(ui(f), /lireMontant\(form\.value\)/, f);
    }
});
