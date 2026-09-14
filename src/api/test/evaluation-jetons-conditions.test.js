/**
 * CE QUE L'ÉVALUATION PRATIQUE IMPRIME, ET CE QU'ELLE CONDITIONNE.
 *
 * Deux usages demandés en même temps que l'écran de saisie : « imprimable sur un document » et
 * « condition de réussite ». Ils partagent un même piège, qui est l'objet de ce fichier :
 * CONFONDRE « PAS D'ÉVALUATION » AVEC « ÉVALUATION RATÉE ». Les deux se ressemblent dans du
 * code — un total à zéro, un booléen faux — et ne se ressemblent en rien sur une attestation.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { resolveTokens, RAW_TOKENS, TOKEN_CATALOG } = require('../lib/tokens.js');
const { resultatsParDossier } = require('../lib/evaluationDossiers.js');

const CHRONO = {
    id: 'ex-1', label: 'Façonnage', bareme: 'TEMPS', max_points: 100, active: 1,
    paliers: JSON.stringify([{ max_s: 60, points: 100 }, { max_s: 120, points: 50 }, { max_s: null, points: 0 }]),
};
const GESTE = { id: 'ex-2', label: 'Lavage des mains', bareme: 'BINAIRE', max_points: 20, active: 1 };

const evaluation = (extra = {}) => ({
    grille: { label: 'Évaluation pratique', pass_score: 70, ...(extra.grille || {}) },
    exercices: extra.exercices || [CHRONO, GESTE],
    notes: extra.notes || [
        { exercice_id: 'ex-1', valeur: '100', points: 50 },
        { exercice_id: 'ex-2', valeur: 'OUI', points: 20 },
    ],
    totaux: extra.totaux || { points: 70, max: 120, percent: 58, notes: 2, total: 2, complet: true },
    reussi: 'reussi' in extra ? extra.reussi : false,
});

test('SANS GRILLE, LES JETONS SONT VIDES — et surtout pas « 0 / 0 »', () => {
    /* LE TEST QUI COMPTE. Un zéro se lit comme une note : imprimer « 0 / 0 — Non réussi » sur
       l'attestation d'une formation qui n'évalue rien ferait dire au document le contraire de
       la réalité, sur un papier qu'on remet au stagiaire. */
    for (const cas of [undefined, null, { grille: null }, { grille: { pass_score: 70 }, exercices: [] }]) {
        const v = resolveTokens({ evaluation: cas });
        assert.strictEqual(v.NoteTotale, '', `cas ${JSON.stringify(cas)}`);
        assert.strictEqual(v.NotePourcent, '');
        assert.strictEqual(v['NoteRésultat'], '');
        assert.strictEqual(v['NoteDétail'], '');
    }
});

test('les points et le pourcentage viennent des totaux du serveur', () => {
    const v = resolveTokens({ evaluation: evaluation() });
    assert.strictEqual(v.NoteTotale, '70 / 120');
    assert.strictEqual(v.NotePoints, '70');
    assert.strictEqual(v.NoteMax, '120');
    assert.strictEqual(v.NotePourcent, '58 %');
    assert.strictEqual(v.NoteSeuil, '70 %');
    assert.strictEqual(v['NoteRésultat'], 'Non réussi');
});

test('sans seuil, on n\'imprime AUCUN verdict', () => {
    /* Une grille peut compter des points sans prononcer de réussite. Écrire « Non réussi »
       faute de seuil transformerait un relevé de notes en échec. */
    const v = resolveTokens({ evaluation: evaluation({ grille: { pass_score: null }, reussi: null }) });
    assert.strictEqual(v.NoteSeuil, '');
    assert.strictEqual(v['NoteRésultat'], '');
    assert.strictEqual(v.NoteTotale, '70 / 120', 'les points, eux, s\'impriment toujours');
});

test('« En cours » tant que le verdict n\'est pas prononçable', () => {
    /* Le serveur rend `null` quand tout n'est pas noté et que le seuil n'est pas déjà atteint :
       ce dossier n'a pas échoué, il n'a pas fini. */
    const v = resolveTokens({ evaluation: evaluation({ reussi: null }) });
    assert.strictEqual(v['NoteRésultat'], 'En cours');
});

test('LE TABLEAU DIT LA MESURE, pas seulement les points', () => {
    /* « 50 points » ne se conteste pas et ne s'explique pas. « 1 min 40 s → 50 points » se
       relit : le stagiaire voit sur quel palier il est tombé. Et la valeur BRUTE (« 100 ») ne
       dirait pas s'il s'agit de secondes, de points ou d'un index de niveau — c'est le barème
       qui la retraduit, le même que celui de la saisie. */
    const html = resolveTokens({ evaluation: evaluation() })['NoteDétail'];
    assert.match(html, /1 min 40 s/, 'le chrono doit être lisible, pas « 100 »');
    assert.match(html, /Acquis/, 'le geste binaire doit dire acquis ou non');
    assert.match(html, /50 \/ 100/);
    assert.match(html, /20 \/ 20/);
    assert.match(html, /Façonnage/);
});

test('un exercice NON NOTÉ se dit, il ne vaut pas zéro', () => {
    const html = resolveTokens({
        evaluation: evaluation({ notes: [{ exercice_id: 'ex-2', valeur: 'OUI', points: 20 }] }),
    })['NoteDétail'];
    assert.match(html, /Non noté/);
    assert.doesNotMatch(html, /0 \/ 100/, 'un exercice non passé n\'est pas un échec à zéro');
});

test('le tableau est injecté en HTML, et sa largeur est un ATTRIBUT', () => {
    /* Hors de RAW_TOKENS, le tableau sortirait comme du texte : le stagiaire lirait
       « <table><tr><td>… » au milieu de son attestation.
       `width="100%"` en attribut et non en CSS : LibreOffice ignore la largeur CSS (CLAUDE.md § 3). */
    assert.ok(RAW_TOKENS.has('NoteDétail'));
    assert.match(resolveTokens({ evaluation: evaluation() })['NoteDétail'], /<table width="100%">/);
});

test('les jetons d\'évaluation sont au catalogue — sinon ils sont « inconnus »', () => {
    /* `findMissingTokens` refuse les jetons hors catalogue : un modèle les portant serait
       signalé en erreur à chaque génération. */
    const groupe = TOKEN_CATALOG.find((g) => g.group === 'Évaluation pratique');
    assert.ok(groupe, 'le groupe doit exister dans la palette');
    const cles = new Set(groupe.tokens.map((t) => t.key));
    for (const k of ['NoteTotale', 'NotePourcent', 'NoteSeuil', 'NoteRésultat', 'NoteDétail']) {
        assert.ok(cles.has(k), `${k} doit être proposé dans la palette`);
    }
});

/* ---------------------------------------------------------------------------------------- */

function fausseBase({ liens, exercices, notes, erreur }) {
    return {
        query: async (sql) => {
            if (erreur) { const e = new Error('nope'); e.code = erreur; throw e; }
            if (/JOIN evaluation_grille g/i.test(sql)) return [liens];
            if (/FROM evaluation_exercice/i.test(sql)) return [exercices];
            if (/FROM evaluation_note/i.test(sql)) return [notes];
            return [[]];
        },
    };
}

test('le lot rend un résultat par dossier, calculé par le barème commun', async () => {
    const conn = fausseBase({
        liens: [{ eid: 'e1', grille_id: 'g1', pass_score: 70 }, { eid: 'e2', grille_id: 'g1', pass_score: 70 }],
        exercices: [{ ...CHRONO, grille_id: 'g1' }, { ...GESTE, grille_id: 'g1' }],
        notes: [
            { enrollment_id: 'e1', exercice_id: 'ex-1', points: 100 },
            { enrollment_id: 'e1', exercice_id: 'ex-2', points: 20 },
            { enrollment_id: 'e2', exercice_id: 'ex-1', points: 0 },
            { enrollment_id: 'e2', exercice_id: 'ex-2', points: 0 },
        ],
    });
    const m = await resultatsParDossier(conn, 'o1', ['e1', 'e2']);
    assert.strictEqual(m.get('e1').percent, 100);
    assert.strictEqual(m.get('e1').reussi, true);
    assert.strictEqual(m.get('e2').percent, 0);
    assert.strictEqual(m.get('e2').reussi, false);
});

test('MIGRATION 148 NON JOUÉE : le lot revient vide, rien ne tombe', async () => {
    /* Les migrations sont jouées à la main par l'organisme. Entre la mise en ligne du code et
       ce moment-là, les conditions qui s'y réfèrent doivent rester fausses — pas faire échouer
       l'affichage de toutes les listes de dossiers. */
    for (const code of ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR']) {
        const m = await resultatsParDossier(fausseBase({ erreur: code }), 'o1', ['e1']);
        assert.strictEqual(m.size, 0);
    }
});

test('une VRAIE erreur de base n\'est pas avalée', () => {
    /* Tolérer la migration absente est une chose ; masquer une panne en est une autre — une
       liste silencieusement privée de ses résultats se lit comme « personne n\'a réussi ». */
    return assert.rejects(() => resultatsParDossier(fausseBase({ erreur: 'ER_LOCK_DEADLOCK' }), 'o1', ['e1']));
});

/* ---------------------------------------------------------------------------------------- */

const CONDITIONS = fs.readFileSync(path.join(__dirname, '..', 'lib/conditions.js'), 'utf8');

test('la condition de réussite existe et est proposée d\'emblée', () => {
    const { VIRTUALS } = require('../lib/conditions.js');
    const cles = VIRTUALS.map((v) => v.key);
    assert.ok(cles.includes('virtual.evaluation_reussie'));
    assert.ok(cles.includes('virtual.evaluation_percent'));
    /* Activée par défaut : un champ de condition qu'il faut d'abord aller cocher dans un écran
       de réglages n'existe, en pratique, pour personne. */
    assert.match(CONDITIONS, /'virtual\.evaluation_reussie', 'virtual\.evaluation_percent',/);
});

test('SANS VERDICT, « réussie » VAUT FAUX — un document conditionné ne sort pas par défaut', () => {
    /* Le cœur de la condition de réussite. `reussi` vaut `null` tant que le verdict n'est pas
       prononçable ; le laisser passer pour vrai ferait délivrer l'attestation de réussite à
       quelqu'un qui n'a pas encore été évalué. */
    assert.match(CONDITIONS, /facts\['virtual\.evaluation_reussie'\] = ev \? ev\.reussi === true : false;/);
});

test('SANS GRILLE, le pourcentage est `null` ET NON ZÉRO', () => {
    /* « 0 % » se compare comme une note : une condition « en dessous de 50 % » attraperait
       tous les dossiers d'une formation qu'on n'évalue pas. */
    assert.match(CONDITIONS, /facts\['virtual\.evaluation_percent'\] = ev \? ev\.percent : null;/);
});

test('les résultats ne sont lus QUE si une condition s\'en sert', () => {
    /* `loadDossierFactsMap` alimente des listes entières. Trois jointures d'évaluation payées
       sur chaque écran qui n'y touche pas seraient gratuites — c'est la précaution déjà prise
       pour l'âge et l'entreprise. */
    assert.match(CONDITIONS, /const needEval = catalog\.some/);
    assert.match(CONDITIONS, /needEval \? await resultatsParDossier\(/);
});

/* ---------------------------------------------------------------------------------------- */

const PALETTE = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');

test('LES JETONS SONT DANS LA PALETTE — sinon ils existent sans que personne puisse les insérer', () => {
    /* DÉFAUT MESURÉ EN PRODUCTION, juste après la mise en ligne. LA PALETTE N'EST PAS LE
       CATALOGUE : elle en est une composition choisie, groupe par groupe. {NoteTotale} se
       résolvait parfaitement si on le tapait à la main, et n'apparaissait nulle part dans
       l'éditeur de modèles — un jeton qu'on ne peut pas insérer n'est pas imprimable, ce qui
       était pourtant l'usage demandé.
       Ni le build ni les tests de résolution ne pouvaient le voir : les deux moitiés étaient
       justes séparément. */
    assert.match(PALETTE, /groups\.push\(catalogGroup\('Évaluation pratique'\)\)/,
        'le groupe doit être poussé dans la palette');
    assert.match(PALETTE, /GROUP_ORDER = \[[\s\S]*?'Évaluation pratique'[\s\S]*?\];/,
        'et rangé à sa place, sinon il tombe en fin de liste');
    /* Le groupe qu'on pousse doit exister dans le catalogue : une faute de frappe rendrait un
       groupe VIDE, sans erreur ni trace. */
    const pousses = [...PALETTE.matchAll(/catalogGroup\('([^']+)'/g)].map((m) => m[1]);
    const connus = new Set(TOKEN_CATALOG.map((g) => g.group));
    for (const nom of pousses) assert.ok(connus.has(nom), `catalogGroup('${nom}') : groupe absent du catalogue`);
});

test('l\'ordre des jetons d\'évaluation n\'est pas trié alphabétiquement', () => {
    /* « NoteDétail » ouvrirait le groupe et le total arriverait après le seuil : on lit une
       note dans l'ordre où on la compose. */
    assert.match(PALETTE, /CURATED_GROUPS = new Set\(\['Évaluation pratique'/);
});

test('une évaluation ne s\'imprime pas sur un document de GROUPE', () => {
    /* Elle note UNE personne : sur un document d'entreprise, ces jetons n'auraient aucun
       dossier à lire et sortiraient vides — la même raison que « Stagiaire » et « Inscription ». */
    assert.match(PALETTE, /HIDDEN_FOR_COMPANY = new Set\(\['Stagiaire', 'Inscription', 'Évaluation pratique'\]\)/);
});
