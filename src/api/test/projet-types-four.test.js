/**
 * « VOTRE PROJET » EN DEUX, ET LE TYPE DE FOUR (demandé le 2026-09-22).
 *
 * LA SÉPARATION. Six cases se suivaient sur une ligne, deux questions mêlées : la NATURE du projet
 * (création, reprise, recherche de poste, perfectionnement) et l'ÉQUIPEMENT qu'il appelle (four,
 * camion). Elles forment désormais deux groupes, dans le formulaire comme sur la fiche.
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

const { phraseProjet } = require('../controllers/consentement.controller.js');
const { normaliserSaisie } = require('../controllers/learner.controller.js');

test('le partenaire lit « four (bois, gaz) », et « four » tant qu\'aucun type n\'est coché', () => {
    assert.strictEqual(phraseProjet({ project_creation: 1, project_oven: 1, project_oven_wood: 1, project_oven_gas: 1 }),
        'création, four (bois, gaz)');
    assert.strictEqual(phraseProjet({ project_oven: 1, project_truck: 1 }), 'four, camion', 'sans type : comme avant');
    // Avant la migration, les colonnes arrivent à NULL (colonneOuNull) : même phrase qu'avant.
    assert.strictEqual(phraseProjet({ project_oven: 1, project_oven_wood: null }), 'four');
    assert.strictEqual(phraseProjet({ project_job: 1, project_improvement: 1 }), 'recherche de poste, perfectionnement');
});

test('un type de four coche « Four » : pas de type sans four', () => {
    assert.strictEqual(normaliserSaisie({ project_oven: 0, project_oven_gas: true }).project_oven, 1);
    assert.strictEqual(normaliserSaisie({ project_oven: 0, project_oven_gas: false }).project_oven, 0, 'aucun type : on n\'invente rien');
});

test('les trois types sont connus partout où le projet est lu ou écrit', () => {
    const LEARNER = lire('controllers/learner.controller.js');
    const CONDITIONS = lire('lib/conditions.js');
    const CONSENT = lire('controllers/consentement.controller.js');
    const MODALE = lireRacine('src/app/ui/components/EditStagiaireModal.jsx');
    const FICHE = lireRacine('src/app/ui/pages/StagiaireDetail.jsx');
    for (const t of TYPES) {
        assert.match(LEARNER, new RegExp(`'${t}'`), `${t} : écrit par la fiche`);
        assert.match(LEARNER.match(/const CASES = new Set\(\[[\s\S]*?\]\);/)[0], new RegExp(`'${t}'`), `${t} : une case décochée n'est pas « perdue »`);
        assert.match(CONDITIONS, new RegExp(`'learner\\.${t}'`), `${t} : utilisable comme condition…`);
        assert.match(CONDITIONS, new RegExp(`${t}: 'Projet : four `), '…avec son libellé');
        assert.match(MODALE, new RegExp(`${t}: \\["le type de four", 172\\]`), `${t} : l'écran dit s'il n'a pas été enregistré`);
        assert.match(FICHE, new RegExp(`l\\.${t} && "`), `${t} : affiché sur la fiche`);
    }
    // Les DEUX lectures de l'export les demandent de façon tolérante (sans la 172 : NULL).
    assert.strictEqual((CONSENT.match(/\$\{await colonnesTypesFour\(conn\)\}/g) || []).length, 2);
    assert.match(CONSENT, /TYPES_FOUR\.map\(\(\[c\]\) => colonneOuNull\(conn, 'learner', c, 'l\.'\)\)/);
});

test('le formulaire sépare la nature du projet de l\'équipement, et le type suit le four', () => {
    const MODALE = lireRacine('src/app/ui/components/EditStagiaireModal.jsx');
    const debut = MODALE.indexOf('<h3 style={{ fontSize: 15, marginBottom: 10 }}>Votre projet');
    const bloc = MODALE.slice(debut, MODALE.indexOf('<h3 id="note-libre-titre"', debut));
    const nature = bloc.slice(bloc.indexOf('<legend>Nature du projet</legend>'), bloc.indexOf('<legend>Équipement</legend>'));
    const equipement = bloc.slice(bloc.indexOf('<legend>Équipement</legend>'));
    for (const c of ['project_creation', 'project_takeover', 'project_job', 'project_improvement']) {
        assert.ok(nature.includes(c) && !equipement.includes(c), `${c} : nature du projet`);
    }
    for (const c of ['project_oven', 'project_truck', ...TYPES]) {
        assert.ok(equipement.includes(c) && !nature.includes(c), `${c} : équipement`);
    }
    // Le type ne s'affiche qu'une fois « Four » coché, et « Four » décoché emporte les types.
    assert.match(equipement, /\{form\.project_oven && \(\s*<div className="projet-sous" role="group" aria-label="Type de four">/);
    assert.match(MODALE, /const toggleFour = \(e\) => setForm\(\(p\) => \(\{ \.\.\.p, project_oven: e\.target\.checked,\s*\.\.\.\(e\.target\.checked \? \{\} : \{ project_oven_wood: false, project_oven_electric: false, project_oven_gas: false \}\) \}\)\);/);
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
