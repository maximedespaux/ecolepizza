/**
 * « VOTRE PROJET » EN DEUX, ET LE TYPE DE FOUR (demandé le 2026-09-22).
 *
 * LA SÉPARATION. Six cases se suivaient sur une ligne, deux questions mêlées : la NATURE du projet
 * (création, reprise, recherche de poste, perfectionnement) et l'ÉQUIPEMENT qu'il appelle (four,
 * camion). Elles forment désormais des groupes, dans le formulaire comme sur la fiche — quatre depuis
 * la migration 173 (projet-cases.test.js), qui ajoute le type d'activité et l'avancement.
 *
 * LE TYPE DE FOUR. « Four » disait qu'un stagiaire veut s'équiper d'un four, pas duquel — la
 * première question d'un fabricant de fours. Trois cases (migration 172) : bois, électrique, gaz ;
 * bois ET gaz disent un four mixte. Comme ses voisines, une case doit être connue partout où le
 * projet est lu ou écrit (cf. projet-perfectionnement.test.js) : en oublier un endroit ne casse rien
 * de visible — la case se coche, ne part pas au partenaire, ne sert pas de condition.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lire = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const lireRacine = (p) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');
const TYPES = ['project_oven_wood', 'project_oven_electric', 'project_oven_gas'];
const catalogue = () => import('../../app/ui/lib/projet.js');

const { phraseProjet } = require('../controllers/consentement.controller.js');
const { normaliserSaisie } = require('../controllers/learner.controller.js');

test('le partenaire lit « four (bois, gaz) », et « four » tant qu\'aucun type n\'est coché', () => {
    assert.strictEqual(phraseProjet({ project_creation: 1, project_oven: 1, project_oven_wood: 1, project_oven_gas: 1 }),
        'création, four (bois, gaz)');
    assert.strictEqual(phraseProjet({ project_oven: 1, project_truck: 1 }), 'four, camion', 'sans type : comme avant');
    // Avant la migration, les colonnes arrivent à NULL (colonnesProjetSql) : même phrase qu'avant.
    assert.strictEqual(phraseProjet({ project_oven: 1, project_oven_wood: null }), 'four');
    assert.strictEqual(phraseProjet({ project_job: 1, project_improvement: 1 }), 'recherche de poste, perfectionnement');
});

test('un type de four coche « Four » : pas de type sans four', () => {
    assert.strictEqual(normaliserSaisie({ project_oven: 0, project_oven_gas: true }).project_oven, 1);
    assert.strictEqual(normaliserSaisie({ project_oven: 0, project_oven_gas: false }).project_oven, 0, 'aucun type : on n\'invente rien');
});

test('les trois types sont connus partout où le projet est lu ou écrit', async () => {
    const LEARNER = lire('controllers/learner.controller.js');
    const CONDITIONS = lire('lib/conditions.js');
    const CONSENT = lire('controllers/consentement.controller.js');
    const MODALE = lireRacine('src/app/ui/components/EditStagiaireModal.jsx');
    const { MIGRATION_DES_CASES, lignesProjet } = await catalogue();
    for (const t of TYPES) {
        assert.match(LEARNER, new RegExp(`'${t}'`), `${t} : écrit par la fiche`);
        assert.match(LEARNER.match(/const CASES = new Set\(\[[\s\S]*?\]\);/)[0], new RegExp(`'${t}'`), `${t} : une case décochée n'est pas « perdue »`);
        assert.match(CONDITIONS, new RegExp(`'learner\\.${t}'`), `${t} : utilisable comme condition…`);
        assert.match(CONDITIONS, new RegExp(`${t}: 'Projet : four `), '…avec son libellé');
        assert.strictEqual(MIGRATION_DES_CASES[t], 172, `${t} : l'écran sait de quelle migration il dépend`);
    }
    // L'écran dit « le type de four » quand la 172 n'est pas jouée : la mention dérive du catalogue.
    assert.match(MODALE, /const CASES_PERDUES = \{ 172: "le type de four", 173: "les nouvelles cases du projet" \};/);
    assert.match(MODALE, /\.\.\.Object\.fromEntries\(Object\.entries\(MIGRATION_DES_CASES\)\.filter\(\(\[, m\]\) => CASES_PERDUES\[m\]\)\.map\(\(\[k, m\]\) => \[k, \[CASES_PERDUES\[m\], m\]\]\)\)/);
    // La fiche : « Four (bois, gaz) ».
    assert.deepStrictEqual(lignesProjet({ project_oven: 1, project_oven_wood: 1, project_oven_gas: 1, project_truck: 1 }),
        [{ label: 'Équipement', value: 'Four (bois, gaz) · Camion / Remorque' }]);
    // Les DEUX lectures de l'export les demandent de façon tolérante (sans la 172 : NULL).
    assert.strictEqual((CONSENT.match(/\$\{await colonnesProjetSql\(conn\)\},/g) || []).length, 2);
    const { colonnesProjetSql } = require('../lib/projet.js');
    const sans172 = { query: async () => [['project_creation', 'project_oven'].map((c) => ({ c }))] };
    const sql = await colonnesProjetSql(sans172);
    for (const t of TYPES) assert.match(sql, new RegExp(`NULL AS ${t}\\b`));
    assert.match(sql, /l\.project_oven\b/);
});

test('le formulaire sépare la nature du projet de l\'équipement, et le type suit le four', async () => {
    const MODALE = lireRacine('src/app/ui/components/EditStagiaireModal.jsx');
    const { GROUPES_PROJET, PRECISIONS_FOUR } = await catalogue();
    const groupe = (titre) => GROUPES_PROJET.find((g) => g.titre === titre).cases.map((c) => c.k);
    for (const c of ['project_creation', 'project_takeover', 'project_job', 'project_improvement']) {
        assert.ok(groupe('Nature du projet').includes(c) && !groupe('Équipement').includes(c), `${c} : nature du projet`);
    }
    for (const c of ['project_oven', 'project_truck']) {
        assert.ok(groupe('Équipement').includes(c) && !groupe('Nature du projet').includes(c), `${c} : équipement`);
    }
    // Les types sont des PRÉCISIONS du four, pas des cases à côté de lui.
    for (const t of TYPES) assert.ok(PRECISIONS_FOUR.includes(t), `${t} : précise le four`);
    // Le type ne s'affiche qu'une fois « Four » coché, et « Four » décoché emporte les types.
    assert.match(MODALE, /onChange=\{c\.precisions \? toggleFour : toggle\(c\.k\)\}/);
    assert.match(MODALE, /\{c\.precisions && form\[c\.k\] && \(\s*<div className="projet-sous" role="group" aria-label=\{`Précisions : \$\{c\.l\}`\}>/);
    assert.match(MODALE, /const toggleFour = \(e\) => setForm\(\(p\) => \(\{ \.\.\.p, project_oven: e\.target\.checked,\s*\.\.\.\(e\.target\.checked \? \{\} : Object\.fromEntries\(PRECISIONS_FOUR\.map\(\(k\) => \[k, false\]\)\)\) \}\)\);/);
    // Trois types perdus ne disent « le type de four » qu'une fois.
    assert.match(MODALE, /const p = \[\.\.\.new Map\(\(r\?\.ignores \|\| \[\]\)\.filter\(\(k\) => PERDUS\[k\]\)\.map\(\(k\) => \[PERDUS\[k\]\[0\], k\]\)\)\.values\(\)\];/);
});

test('la migration ajoute les trois cases, rejouable, et son revert les retire', () => {
    const MIG = lireRacine('database/migrations/172_projet_types_four.sql');
    const code = MIG.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const t of TYPES) {
        assert.match(code, new RegExp(`ADD COLUMN IF NOT EXISTS ${t} TINYINT\\(1\\) NOT NULL DEFAULT 0`), `${t} : comme ses six voisines`);
    }
    const REVERT = lireRacine('database/migrations/172_revert_projet_types_four.sql').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const t of TYPES) assert.match(REVERT, new RegExp(`DROP COLUMN IF EXISTS ${t}`));
    for (const f of [MIG, lireRacine('database/migrations/172_revert_projet_types_four.sql')]) {
        const commentaires = (f.match(/\/\*[\s\S]*?\*\//g) || []).join('');
        assert.ok(!commentaires.includes(';'), 'aucun point-virgule dans les commentaires (cf. la 146)');
    }
});
