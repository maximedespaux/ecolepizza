/**
 * JETON {Stagiaires semaine} — le NOMBRE de stagiaires de la semaine, TOUTES sessions confondues
 * (demandé le 2026-10-08) : « 3 en RS7404 + 2 en NIV1 = 5 ».
 *
 *   · le décompte est DISTINCT (des personnes, pas des inscriptions) et vient de la (des) semaine(s)
 *     des sessions du document — plusieurs couples (année, semaine) → autant de conditions OR ;
 *   · un retrait efface l'inscription, donc un retiré n'est plus compté (rien à filtrer en plus) ;
 *   · sans semaine (facture libre, document hors session) → null → le jeton sort vide, et il est
 *     FACULTATIF (jamais « information manquante »).
 */
const test = require('node:test');
const assert = require('node:assert');

// db paresseux, stubé avant de requérir le contrôleur (par prudence — la fonction testée prend sa
// propre connexion en argument, mais le require charge le module).
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: { promise: () => ({ query: async () => [[]] }) } };

const { compterStagiairesSemaine } = require('../controllers/document.controller.js');
const { resolveTokens, TOKEN_CATALOG, OPTIONAL_TOKENS, catalogKeys } = require('../lib/tokens.js');

const faire = (n) => { const vu = []; return { conn: { query: async (sql, params) => { vu.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); return [[{ n }]]; } }, vu }; };

test('une seule semaine : une condition, les bons paramètres, le compte rendu', async () => {
    const { conn, vu } = faire(5);
    const n = await compterStagiairesSemaine(conn, 'org1', [{ year: 2026, week: 6 }]);
    assert.strictEqual(n, 5);
    assert.strictEqual(vu.length, 1);
    assert.match(vu[0].sql, /COUNT\(DISTINCT e\.learner_id\)/);
    assert.match(vu[0].sql, /FROM enrollment e JOIN training_session s ON s\.id = e\.session_id/);
    assert.match(vu[0].sql, /WHERE s\.organization_id = \? AND \(\(s\.year = \? AND s\.week = \?\)\)/);
    assert.deepStrictEqual(vu[0].params, ['org1', 2026, 6]);
});

test('même semaine répétée (plusieurs formations) : dédoublonnée en UNE condition', async () => {
    const { conn, vu } = faire(5);
    await compterStagiairesSemaine(conn, 'org1', [{ year: 2026, week: 6 }, { year: 2026, week: 6 }]);
    assert.deepStrictEqual(vu[0].params, ['org1', 2026, 6], 'un seul couple (année, semaine)');
    assert.strictEqual((vu[0].sql.match(/s\.year = \?/g) || []).length, 1);
});

test('plusieurs semaines : une condition OR par couple, tous les paramètres', async () => {
    const { conn, vu } = faire(9);
    const n = await compterStagiairesSemaine(conn, 'org1', [{ year: 2026, week: 6 }, { year: 2026, week: 12 }]);
    assert.strictEqual(n, 9);
    assert.match(vu[0].sql, /\(s\.year = \? AND s\.week = \?\) OR \(s\.year = \? AND s\.week = \?\)/);
    assert.deepStrictEqual(vu[0].params, ['org1', 2026, 6, 2026, 12]);
});

test('aucune semaine connue : null, et AUCUNE requête', async () => {
    const { conn, vu } = faire(3);
    assert.strictEqual(await compterStagiairesSemaine(conn, 'org1', []), null);
    assert.strictEqual(await compterStagiairesSemaine(conn, 'org1', [{}, { week: 6 }, null]), null, 'couple incomplet ignoré');
    assert.strictEqual(vu.length, 0, 'on n\'interroge pas la base sans semaine');
});

test('resolveTokens : la valeur passe telle quelle, vide quand inconnue', () => {
    const base = { org: {}, learner: {}, company: null, formations: [{ year: 2026, week: 6 }] };
    assert.strictEqual(resolveTokens({ ...base, nbStagiairesSemaine: 5 })['Stagiaires semaine'], '5');
    assert.strictEqual(resolveTokens({ ...base, nbStagiairesSemaine: 0 })['Stagiaires semaine'], '0');
    assert.strictEqual(resolveTokens({ ...base, nbStagiairesSemaine: null })['Stagiaires semaine'], '', 'inconnue → vide, pas « 0 »');
    assert.strictEqual(resolveTokens(base)['Stagiaires semaine'], '', 'absente → vide');
});

test('le jeton est au catalogue (groupe Session), résolu et FACULTATIF', () => {
    assert.ok(catalogKeys().includes('Stagiaires semaine'), 'proposé dans la palette');
    const session = TOKEN_CATALOG.find((g) => g.group === 'Session');
    assert.ok(session && session.tokens.some((t) => t.key === 'Stagiaires semaine'), 'dans le groupe Session');
    assert.ok(OPTIONAL_TOKENS.has('Stagiaires semaine'), 'facultatif : vide ≠ information manquante');
    assert.ok('Stagiaires semaine' in resolveTokens({ org: {}, learner: {}, formations: [{}] }), 'toujours résolu');
});
