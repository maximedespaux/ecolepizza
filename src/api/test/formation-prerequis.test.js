/**
 * LES PRÉREQUIS D'UNE FORMATION — texte libre, et un jeton documentaire.
 *
 * POURQUOI UNE COLONNE À PART, et pas « Public visé ». `audience` dit À QUI la formation
 * s'adresse ; les prérequis disent CE QU'IL FAUT DÉJÀ savoir ou posséder pour y entrer. Qualiopi
 * contrôle les deux SÉPARÉMENT : les fondre rendrait le programme de formation faux au moment
 * précis où on le présente à l'audit.
 *
 * CE QUE CES TESTS PROTÈGENT SURTOUT, c'est le « avant/après migration ». Une colonne neuve citée
 * en dur dans un SELECT casse la page — ou pire, la GÉNÉRATION DE DOCUMENTS — tant que la
 * migration n'est pas jouée. Trois lectures la traversent (liste des formations, contexte
 * documentaire, espace stagiaire) et chacune doit la SONDER, jamais la supposer.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const RACINE = path.join(API, '..', '..');
const { TOKEN_CATALOG } = require('../lib/tokens.js');
const SRC = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const PROG = SRC('controllers/formationProgram.controller.js');
const DOC = SRC('controllers/document.controller.js');
const ESPACE = SRC('controllers/espace.controller.js');
const TOKENS = SRC('lib/tokens.js');
const PAGE = fs.readFileSync(path.join(RACINE, 'src/app/ui/pages/Formations.jsx'), 'utf8');

test('la migration existe, avec son revert, et se rejoue sans risque', () => {
    const d = path.join(RACINE, 'database/migrations');
    const aller = fs.readFileSync(path.join(d, '143_formation_prerequis.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(d, '143_revert_formation_prerequis.sql'), 'utf8');
    assert.match(aller, /ADD COLUMN IF NOT EXISTS\s+prerequisites text/);
    assert.match(retour, /DROP COLUMN IF EXISTS\s+prerequisites/);
    // Commentaires en BLOCS, jamais en `--` : la convention du dépôt.
    assert.doesNotMatch(aller, /^\s*--/m, 'commentaires en blocs /* … */');
});

test('le jeton {Prérequis} existe, et se lit à côté de « Public visé »', () => {
    const groupe = TOKEN_CATALOG.find((g) => g.group === 'Formation');
    const cles = groupe.tokens.map((t) => t.key);
    assert.ok(cles.includes('Prérequis'), 'le jeton doit être proposé dans le groupe Formation');
    assert.strictEqual(cles[cles.indexOf('Public') + 1], 'Prérequis',
        'placé contre « Public visé » : les deux se lisent ensemble sur un programme');
    const jeton = groupe.tokens.find((t) => t.key === 'Prérequis');
    assert.ok(jeton.sample && jeton.sample.length > 10, 'un exemple parlant, pas un mot vide');
});

test('le jeton est REMPLI, dans le document comme dans la boucle {#formations}', () => {
    /* Un jeton déclaré mais jamais rempli est pire qu'absent : il s'insère depuis la palette,
       s'imprime vide, et on cherche l'erreur du côté de la saisie. */
    assert.match(TOKENS, /'Prérequis': block\('prerequisites'\),/, 'agrégé comme les objectifs');
    assert.match(TOKENS, /'Prérequis': x\.prerequisites \|\| '',/, 'et dans la boucle {#formations}');
});

test('les TROIS lectures sondent la colonne au lieu de la supposer', () => {
    /* Sans ça, tant que la migration n'est pas jouée : liste des formations en erreur, espace
       stagiaire en erreur, et surtout génération de documents en erreur — c'est-à-dire le cœur
       du métier arrêté par une colonne facultative. */
    for (const [src, ou] of [[PROG, 'liste des formations'], [DOC, 'contexte documentaire'], [ESPACE, 'espace stagiaire']]) {
        assert.match(src, /colonneOuNull\(conn, 'training_program', 'prerequisites'/,
            `${ou} : la colonne doit être sondée`);
    }
});

test('l\'écriture retombe sur le repli si la colonne manque encore', () => {
    // Le repli existait déjà pour `horaires` : la nouvelle colonne le rejoint, sinon créer ou
    // modifier une formation échouerait tant que la migration n'est pas passée.
    const replis = [...PROG.matchAll(/const drop = new Set\(\['horaires', 'prerequisites'\]\);/g)];
    assert.strictEqual(replis.length, 2, 'création ET mise à jour');
    assert.match(PROG, /'program_detail', 'prerequisites',/, 'le champ est accepté à l\'écriture');
});

test('le champ est saisissable, et annoncé avec son jeton', () => {
    assert.match(PAGE, /"audience", "prerequisites", "objective_general"/, 'déclaré parmi les champs éditables');
    assert.match(PAGE, /value=\{form\.prerequisites\} onChange=\{set\("prerequisites"\)\}/);
    // L'étiquette nomme le jeton : c'est ce qui relie la saisie au document qui l'imprimera.
    assert.match(PAGE, /Prérequis \(jeton \{"\{Prérequis\}"\}\)/);
});
