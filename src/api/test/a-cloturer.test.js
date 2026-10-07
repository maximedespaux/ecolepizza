/**
 * « À CLÔTURER » — UN DOSSIER À 100 % DONT LA FORMATION N'EST PAS ENCORE TERMINÉE.
 *
 * Demandé le 2026-10-07 : « un indicateur visuel quand un stagiaire est à 100 % du parcours mais
 * n'est pas considéré comme “terminé” sur sa fiche ». Deux états qui peuvent diverger :
 *   · le PARCOURS est CALCULÉ (lib/avancement.js), à partir des documents, pièces et remises ;
 *   · la formation TERMINÉE est DÉCLARÉE par l'école (`learner.completed_levels`, une liste de
 *     codes de formation acquise, alimentée par la fiche avec `program.code`).
 * Un dossier à 100 % non encore déclaré terminé, c'est précisément ce qu'on veut voir — pour penser
 * à le clore. L'école a tranché : on signale DÈS 100 %, sans attendre que la session soit passée.
 *
 * Ce fichier gèle : la règle pure (`estACloturer`), le fait que `dossiersACloturer` lit bien le
 * pourcentage du VRAI moteur et n'en retient que les bons dossiers, et les points de câblage (le
 * drapeau du suivi, l'endpoint de la liste, la route avant `/:id`, les deux écrans).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* ── On garde le VRAI moteur (avancementDossiers + computeDocParcours) et on ne feint QUE les
      chargeurs liés à la base, pour piloter le pourcentage de façon déterministe. node --test isole
      chaque fichier dans son propre processus : ces stubs ne fuient pas vers les autres tests. ── */
function stub(rel, exports) {
    const p = require.resolve(rel);
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
stub('../lib/conditions.js', {
    loadConditionMap: async () => new Map(),
    champsDesConditions: async () => [],
    loadDossierFactsMap: async () => new Map(),
});
stub('../lib/equivalence.js', { loadEquivalences: async () => [], equivalenceMap: () => new Map() });
/* NIV1 : une seule étape, FACULTATIVE → rien de dû → 100 % (lib/parcours.js : « rien de dû, c'est
   100 % »). NIV2 : aucune étape → 0 %. De quoi obtenir les deux pourcentages sans toucher la base. */
const UNE_FACULTATIVE = [{ slug: 'bonus', label: 'Bonus', doc_type: 'ATTESTATION', facultatif: true }];
stub('../controllers/formationProgram.controller.js', {
    enrollmentSteps: async (conn, orgId, program) => (program.code === 'NIV1' ? UNE_FACULTATIVE.slice() : []),
    formationSteps: async () => [],
});
stub('../controllers/template.controller.js', { loadOrgSteps: async () => [] });

const { estACloturer, dossiersACloturer } = require('../lib/avancement.js');

const RACINE = path.join(__dirname, '..', '..');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(RACINE, 'app/ui', f), 'utf8');

// ── La règle pure ────────────────────────────────────────────────────────────────────────────
test('estACloturer : 100 % ET la formation pas dans completed_levels', () => {
    assert.strictEqual(estACloturer(100, 'NIV1', ''), true, '100 %, aucune formation acquise');
    assert.strictEqual(estACloturer(100, 'NIV1', null), true, 'colonne nulle : rien d\'acquis');
    assert.strictEqual(estACloturer(100, 'NIV1', 'NIV2'), true, 'un AUTRE code acquis ne compte pas');
    assert.strictEqual(estACloturer('100', 'NIV1', ''), true, 'pourcentage en chaîne (mysql2)');
    // Exclus : déjà terminé.
    assert.strictEqual(estACloturer(100, 'NIV1', 'NIV1'), false, 'formation déjà déclarée terminée');
    assert.strictEqual(estACloturer(100, 'NIV1', 'NIV2,NIV1'), false, 'terminée, parmi d\'autres');
    assert.strictEqual(estACloturer(100, 'NIV1', ' NIV1 , NIV2 '), false, 'les espaces de la liste sont ignorés');
    // Exclus : pas encore à 100 %, ou dossier sans formation.
    assert.strictEqual(estACloturer(99, 'NIV1', ''), false, 'pas encore 100 %');
    assert.strictEqual(estACloturer(0, 'NIV1', ''), false);
    assert.strictEqual(estACloturer(100, null, ''), false, 'dossier sans code de formation');
    assert.strictEqual(estACloturer(100, '', ''), false);
    // Pas de faux positif par préfixe : « NIV1 » n'est pas « NIV10 » (comparaison exacte, pas sous-chaîne).
    assert.strictEqual(estACloturer(100, 'NIV1', 'NIV10'), true);
});

// ── Le moteur réel, piloté par les stubs ───────────────────────────────────────────────────────
const ENR = [
    { enrollment_id: 'A', learner_id: 'LA', program_id: 'p1', program_code: 'NIV1', program_days: 5, completed_levels: '' },     // 100 %, pas terminé → À CLÔTURER
    { enrollment_id: 'B', learner_id: 'LB', program_id: 'p1', program_code: 'NIV1', program_days: 5, completed_levels: 'NIV1' }, // 100 % mais terminé → non
    { enrollment_id: 'C', learner_id: 'LC', program_id: 'p2', program_code: 'NIV2', program_days: 5, completed_levels: '' },     // 0 % → non
];
const connDe = (rows) => ({
    query: async (sql) => {
        if (/FROM enrollment e/.test(sql) && /completed_levels/.test(sql)) return [rows];
        return [[]]; // pièces, remises, points de rupture, documents : aucun
    },
});

test('dossiersACloturer : ne retient que le dossier à 100 % non terminé', async () => {
    const out = await dossiersACloturer(connDe(ENR), 'o1');
    assert.deepStrictEqual(out.map((r) => r.learner_id), ['LA'], 'B (terminé) et C (0 %) sont écartés');
    assert.deepStrictEqual(out[0], { enrollment_id: 'A', learner_id: 'LA', program_code: 'NIV1' });
});

test('un même stagiaire n\'apparaît pas deux fois (dédoublonné à l\'endpoint)', async () => {
    /* Deux dossiers à clôturer d'une même personne : dossiersACloturer rend les deux lignes, et
       c'est l'endpoint qui réduit à l'identifiant unique (cf. le câblage plus bas). */
    const deux = [
        { ...ENR[0], enrollment_id: 'A1', learner_id: 'LX' },
        { ...ENR[0], enrollment_id: 'A2', learner_id: 'LX' },
    ];
    const out = await dossiersACloturer(connDe(deux), 'o1');
    assert.strictEqual(out.length, 2, 'deux dossiers');
    assert.deepStrictEqual([...new Set(out.map((r) => r.learner_id))], ['LX'], 'un seul stagiaire');
});

test('la requête lit completed_levels et joint la formation, bornée à l\'organisme', async () => {
    let enrSql = '';
    const conn = { query: async (sql, params) => {
        if (/FROM enrollment e/.test(sql)) { enrSql = sql; assert.deepStrictEqual(params, ['o7']); return [[]]; }
        return [[]];
    } };
    await dossiersACloturer(conn, 'o7');
    assert.match(enrSql, /l\.completed_levels/);
    assert.match(enrSql, /LEFT JOIN training_program p ON p\.id = s\.program_id/);
    assert.match(enrSql, /WHERE e\.organization_id = \?/);
});

// ── Le câblage serveur ─────────────────────────────────────────────────────────────────────────
test('le suivi porte le drapeau a_cloturer, calculé par la règle partagée', () => {
    const src = lire('controllers/suivi.controller.js');
    assert.match(src, /const \{ avancementDossiers, estACloturer \} = require\('\.\.\/lib\/avancement\.js'\)/);
    assert.match(src, /l\.completed_levels/, 'la requête des dossiers lit la colonne');
    assert.match(src, /a_cloturer: estACloturer\(percent, e\.program_code, e\.completed_levels\)/);
});

test('l\'endpoint de la liste rend des identifiants DISTINCTS', () => {
    const src = lire('controllers/learner.controller.js');
    assert.match(src, /const \{ dossiersACloturer \} = require\('\.\.\/lib\/avancement\.js'\)/);
    assert.match(src, /const getACloturer = async/);
    assert.match(src, /dossiersACloturer\(db\.promise\(\), req\.user\.organization_id\)/);
    assert.match(src, /\[\.\.\.new Set\(rows\.map\(\(r\) => r\.learner_id\)\.filter\(Boolean\)\)\]/);
    // Table/colonne absente = liste vide, pas une panne.
    assert.match(src, /ER_BAD_FIELD_ERROR' \|\| err\.code === 'ER_NO_SUCH_TABLE'\) return res\.json\(\{ data: \[\] \}\)/);
});

test('la route /a-cloturer est au personnel, et passe AVANT /:id', () => {
    const routes = lire('routes/learner.routes.js');
    const a = routes.indexOf("router.get('/a-cloturer'");
    assert.ok(a > 0 && a < routes.indexOf("router.get('/:id'"), 'sinon « a-cloturer » serait pris pour un identifiant');
    assert.match(routes, /router\.get\('\/a-cloturer', authorizeRoles\(\.\.\.STAFF_ROLES\), getACloturer\)/);
});

// ── Les écrans ───────────────────────────────────────────────────────────────────────────────
test('apiClient : l\'appel est silencieux (chargé à part de la liste)', () => {
    const api = lireUi('api/apiClient.js');
    assert.match(api, /export function getStagiairesACloturer\(\)/);
    assert.match(api, /"\/stagiaires\/a-cloturer", \{ silent: true \}/);
});

test('LISTE DES STAGIAIRES : une pastille verte « À clôturer » sur la ligne', () => {
    const page = lireUi('pages/Stagiaires.jsx');
    assert.match(page, /getStagiairesACloturer/);
    assert.match(page, /getStagiairesACloturer\(\)\.then\(\(r\) => setACloturer\(new Set\(r\.data \|\| \[\]\)\)\)/);
    assert.match(page, /aCloturer\.has\(l\.id\) && \(/);
    assert.match(page, /tone="g" className="cloturer-chip"/);
});

test('SUIVI QUALIOPI : « À clôturer » sous le nom du dossier', () => {
    const page = lireUi('pages/Suivi.jsx');
    assert.match(page, /d\.a_cloturer && \(/);
    assert.match(page, /className="sg-cloturer"/);
});

test('les deux pastilles ont leur style (vert, tenue d\'une ligne)', () => {
    const css = lireUi('styles/app.css');
    assert.match(css, /\.cloturer-chip\{/);
    assert.match(css, /\.sg-cloturer\{[^}]*color:var\(--green\)/);
});
