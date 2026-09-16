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
const projets = (texte) => [...new Set([...texte.matchAll(/project_[a-z]+/g)].map((m) => m[0]))].sort();

test('les trois listes de « Votre projet » disent le même ensemble', () => {
    /* `fin` se cherche APRÈS `deb`, sinon `indexOf` le trouve au début du fichier et la tranche
       revient vide — l'assertion aurait comparé deux listes vides, donc réussi pour rien. */
    const bloc = (deb, fin) => {
        const i = MODALE.indexOf(deb);
        assert.ok(i >= 0, `marqueur introuvable : ${deb}`);
        const j = MODALE.indexOf(fin, i + deb.length);
        assert.ok(j > i, `fin introuvable après ${deb}`);
        return MODALE.slice(i, j);
    };
    const dansEmpty = projets(bloc('const EMPTY', 'const BOOL_FIELDS'));
    const dansBool = projets(bloc('const BOOL_FIELDS', 'const dateOnly'));
    const rendues = projets(bloc('<h3 style={{ fontSize: 15, marginBottom: 10 }}>Votre projet', '</div>'));

    assert.ok(dansEmpty.includes('project_improvement'), 'la case existe dans l\'état initial');
    assert.deepStrictEqual(dansBool, dansEmpty, 'BOOL_FIELDS suit EMPTY');
    assert.deepStrictEqual(rendues, dansEmpty, 'les cases rendues suivent EMPTY');
});

test('« Perfectionnement » est connu partout où le projet est lu ou écrit', () => {
    /* Six endroits touchent ces colonnes. En oublier un ne casse rien de visible : la case se
       coche, ne part pas dans l'export au partenaire, et ne peut pas servir de condition de
       document — on ne s'en aperçoit que le jour du contrôle. */
    assert.match(LEARNER, /'project_improvement',/, 'écrite par la fiche');
    assert.match(CONDITIONS, /'learner\.project_improvement'/, 'utilisable comme condition…');
    assert.match(CONDITIONS, /project_improvement: 'Projet : perfectionnement'/, '…avec son libellé');
    assert.match(CONSENT, /\['project_improvement', 'perfectionnement'\]/, 'dite dans l\'export partenaire');
    assert.strictEqual((CONSENT.match(/colonneOuNull\(conn, 'learner', 'project_improvement'/g) || []).length, 2,
        'les DEUX SELECT explicites la demandent de façon tolérante');
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
