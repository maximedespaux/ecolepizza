const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const lire = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const MODALE = readFileSync(path.join(__dirname, '../../app/ui/components/EditStagiaireModal.jsx'), 'utf8');
const LEARNER = lire('controllers/learner.controller.js');
const CONSENT = lire('controllers/consentement.controller.js');
const CONDITIONS = lire('lib/conditions.js');

/* Le projet d'un stagiaire est une SÉRIE DE BOOLÉENS, et le fichier de la modale en tient trois
   listes : `EMPTY` (l'état initial), `BOOL_FIELDS` (ce que `toForm` convertit en booléen) et les
   cases réellement rendues. Trois listes du même ensemble finissent toujours par diverger — et
   la divergence est SILENCIEUSE ici : une case oubliée dans `BOOL_FIELDS` passe par la branche
   `?? ""` de `toForm`, arrive donc à la chaîne vide, et s'enregistre comme telle. */
/* `[a-z_]+` et non `[a-z]+` : depuis la migration 172, `project_oven_wood` et ses voisines — lues
   `project_oven` par l'ancienne expression, elles auraient passé le test sans y figurer. */
const projets = (texte) => [...new Set([...texte.matchAll(/project_[a-z_]+/g)].map((m) => m[0]))].sort();
const catalogue = () => import('../../app/ui/lib/projet.js');
const { phraseProjet } = require('../lib/projet.js');

test('les trois listes de « Votre projet » disent le même ensemble', async () => {
    /* DEPUIS LE 2026-09-22, ELLES DÉRIVENT TOUTES TROIS DU CATALOGUE (lib/projet.js) : vingt-quatre
       cases recopiées trois fois n'auraient pas tenu. Le test vérifie donc la dérivation — et
       qu'aucune case n'est plus écrite à la main dans la modale, où elle échapperait aux trois. */
    const { CASES_PROJET } = await catalogue();
    assert.ok(CASES_PROJET.includes('project_improvement'), 'la case existe dans le catalogue');
    assert.strictEqual(new Set(CASES_PROJET).size, CASES_PROJET.length, 'aucune case en double');
    const bloc = (deb, fin) => {
        const i = MODALE.indexOf(deb);
        assert.ok(i >= 0, `marqueur introuvable : ${deb}`);
        const j = MODALE.indexOf(fin, i + deb.length);
        assert.ok(j > i, `fin introuvable après ${deb}`);
        return MODALE.slice(i, j);
    };
    assert.match(bloc('const EMPTY', 'const BOOL_FIELDS'), /\.\.\.Object\.fromEntries\(CASES_PROJET\.map\(\(k\) => \[k, false\]\)\),/,
        'l\'état initial');
    assert.match(MODALE, /const BOOL_FIELDS = \[\.\.\.CASES_PROJET, "a_recontacter"\];/, 'la conversion en booléens');
    /* Les cases rendues : chaque groupe, chaque case, chaque précision du four — lues sur `form`. */
    const rendues = bloc('<h3 style={{ fontSize: 15, marginBottom: 10 }}>Votre projet', '<h3 id="note-libre-titre"');
    assert.match(rendues, /\{GROUPES_PROJET\.map\(\(g\) => \([\s\S]*\{g\.cases\.map\(\(c\) => \([\s\S]*checked=\{!!form\[c\.k\]\}[\s\S]*\{c\.precisions\.map\(\(pr\) => \([\s\S]*checked=\{!!form\[pr\.k\]\}/);
    // « Four » seul reste nommé : `toggleFour` emporte ses précisions.
    assert.deepStrictEqual(projets(MODALE), ['project_oven'], 'aucune autre case écrite à la main');
});

test('« Perfectionnement » est connu partout où le projet est lu ou écrit', async () => {
    /* Six endroits touchent ces colonnes. En oublier un ne casse rien de visible : la case se
       coche, ne part pas dans l'export au partenaire, et ne peut pas servir de condition de
       document — on ne s'en aperçoit que le jour du contrôle. (Toutes les cases du catalogue :
       projet-cases.test.js.) */
    assert.match(LEARNER, /'project_improvement',/, 'écrite par la fiche');
    assert.match(CONDITIONS, /'learner\.project_improvement'/, 'utilisable comme condition…');
    assert.match(CONDITIONS, /project_improvement: 'Projet : perfectionnement'/, '…avec son libellé');
    assert.strictEqual(phraseProjet({ project_improvement: 1 }), 'perfectionnement', 'dite dans l\'export partenaire');
    assert.strictEqual((CONSENT.match(/\$\{await colonnesProjetSql\(conn\)\},/g) || []).length, 2,
        'les DEUX SELECT explicites la demandent de façon tolérante');
    /* Le septième, oublié jusqu'au 2026-09-21 : la carte « Projet » de la fiche. Qui ne cochait que
       « Perfectionnement » y lisait « Aucun projet renseigné ». */
    const { lignesProjet } = await catalogue();
    assert.deepStrictEqual(lignesProjet({ project_improvement: 1 }), [{ label: 'Nature', value: 'Perfectionnement' }]);
    const FICHE = readFileSync(path.join(__dirname, '../../app/ui/pages/StagiaireDetail.jsx'), 'utf8');
    assert.match(FICHE, /const projet = lignesProjet\(l\);/, 'affichée sur la fiche');
});

test('la liste blanche d\'écriture est filtrée sur les colonnes que la table porte', () => {
    /* LE CODE DOIT MARCHER AVANT ET APRÈS LA MIGRATION (CLAUDE.md § 2.1). Le formulaire envoie
       TOUS ses champs : sans ce filtre, ajouter une colonne à `LEARNER_FIELDS` faisait échouer
       la création d'une fiche tant que la migration n'était pas jouée — un ER_BAD_FIELD_ERROR
       incompréhensible pour qui n'avait rien demandé de nouveau.

       Appliqué une fois pour toutes plutôt qu'une fois par colonne : celle qu'on ajoutera
       demain en hérite sans y penser. */
    assert.match(LEARNER, /async function champsEcrivables\(conn\)/);
    assert.match(LEARNER, /return LEARNER_FIELDS\.filter\(\(f\) => presentes\.has\(f\)\)/);
    assert.ok(!/const cols = LEARNER_FIELDS\.filter/.test(LEARNER), 'la création passe par le filtre');
    assert.ok(!/for \(const field of LEARNER_FIELDS\)/.test(LEARNER), 'la mise à jour aussi');
    /* Ne pas savoir ne doit pas empêcher d'enregistrer : on retombe sur le comportement d'avant. */
    assert.match(LEARNER, /catch \{[\s\S]{0,300}return LEARNER_FIELDS;/);
});

test('« BTS » est proposé dans le niveau de diplôme', () => {
    // Un BTS vaut BAC +2 : rangé à côté, pour qu'on ne le cherche pas en fin de liste.
    assert.match(MODALE, /"BAC \+2", "BTS", "BAC \+3"/);
});
