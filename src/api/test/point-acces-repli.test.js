/**
 * LE POINT D'ACCÈS NE RÉCLAME PLUS UN DOCUMENT QUI N'EXISTERA JAMAIS (constaté le 2026-09-24).
 *
 * LE DÉFAUT. Une stagiaire NIV1H arrivée via une entreprise (dossier PROFESSIONNEL) avait tout
 * signé : devis et convention par l'entreprise, « Droit à l'image » elle-même. Le volet entreprise
 * du point d'accès était franchi (3/3) ; le volet dossier exigeait 3 documents et en comptait 2.
 * Pizza Quest, Outils et Communauté restaient fermés — rechargement ou pas.
 *
 * DEUX CAUSES, qui ne se voyaient qu'ensemble :
 *   1. LE REPLI. Dans le parcours standard, la variante professionnelle du contrat (`convention`)
 *      est INACTIVE : elle vit dans la section entreprise. Le groupe « OU » du contrat n'a donc
 *      qu'un membre actif, le `contrat` des particuliers, dont la condition échoue pour elle.
 *      Aucune variante ne s'appliquant, `resoudreVariantes` garde la première « pour ne jamais
 *      perdre le jalon » — et la garde l'EXIGEAIT. Aucun geste ne pouvait la satisfaire.
 *   2. LE CHAMP DÉCOCHÉ. `enrollment.financing` avait été décoché dans Paramètres → Champs : les
 *      conditions « Financeur Particulier / Professionnel » l'évaluaient contre une valeur absente,
 *      donc FAUX pour tout le monde. Écarter le seul repli aurait alors cessé d'exiger devis et
 *      contrat aux PARTICULIERS aussi — pour qui ils ne sont pas un repli, mais LA variante.
 *
 * Mesuré en production sur son dossier, avant correction : exigences = devis-particulier, contrat,
 * droit-image ; `matchCustom(contrat)` = faux, avec ou sans le fait. L'exigence venait du repli.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resoudreVariantes } = require('../controllers/formationProgram.controller.js');
const { exigencesDossier } = require('../lib/pointDeRupture.js');
const { champsDesConditions, getEnabledFields } = require('../lib/conditions.js');

// La condition telle que loadConditionMap la rend (valeur JSON déjà relue).
const CONDS = new Map([['financeur-particulier', { field: 'enrollment.financing', op: 'eq', value: 'PARTICULIER' }]]);
// Le groupe « OU » du contrat (équivalence d'organisme) : contrat des particuliers OU convention.
const EQ = new Map([['contrat', { group: 'org-contrat' }], ['convention', { group: 'org-contrat' }]]);
// NIV1H réduit aux étapes ACTIVES (enrollmentSteps écarte `convention`, inactive ici).
const contrat = { slug: 'contrat', doc_type: 'CONTRAT', sort_order: 40, stagiaire_sign: 1, active: 1, applies_when: { conditions: ['financeur-particulier'] } };
const droitImage = { slug: 'droit-image', doc_type: 'DROIT_IMAGE', sort_order: 90, stagiaire_sign: 1, active: 1, applies_when: {} };
const faits = (financement) => ({ financing: financement, 'enrollment.financing': financement });
// Seuil 90 : le point d'accès de NIV1H est posé sur « Droit à l'image ».
const exigees = (financement) => exigencesDossier(resoudreVariantes([contrat, droitImage], faits(financement), CONDS, EQ), 90)
    .map((s) => s.slug);

/* ─── Le repli n'est jamais exigé ──────────────────────────────────────────────────────────── */

test('professionnelle : le contrat des particuliers n\'est qu\'un repli — seul « Droit à l\'image » est exigé', () => {
    assert.deepStrictEqual(exigees('PROFESSIONNEL'), ['droit-image']);
});

test('particulier : le contrat est SA variante — il reste exigé', () => {
    assert.deepStrictEqual(exigees('PARTICULIER'), ['contrat', 'droit-image']);
});

test('le repli reste AFFICHÉ, marqué, et l\'étape d\'origine n\'est jamais modifiée', () => {
    const out = resoudreVariantes([contrat, droitImage], faits('PROFESSIONNEL'), CONDS, EQ);
    const repli = out.find((s) => s.slug === 'contrat');
    assert.ok(repli, 'le jalon reste dans le parcours affiché (jamais de jalon perdu)');
    assert.strictEqual(repli.repli, true);
    assert.strictEqual(contrat.repli, undefined, 'l\'étape d\'origine sert aux autres dossiers : on marque une COPIE');
    const choisi = resoudreVariantes([contrat], faits('PARTICULIER'), CONDS, EQ)[0];
    assert.ok(!choisi.repli, 'une variante qui s\'applique n\'est pas un repli');
});

/* ─── Une condition lit son champ, même décoché ────────────────────────────────────────────── */

// Base simulée : deux champs de dossier, décochés tous les deux pour les conditions.
const conn = {
    query: async (sql) => {
        if (/information_schema\.COLUMNS/.test(sql)) return [[
            { t: 'enrollment', c: 'financing', dt: 'enum', ct: "enum('PARTICULIER','PROFESSIONNEL')", cm: '' },
            { t: 'enrollment', c: 'crm_stage', dt: 'varchar', ct: 'varchar(40)', cm: '' },
        ]];
        if (/FROM condition_field/.test(sql)) return [[
            { source_table: 'enrollment', column_name: 'financing', enabled: 1, enabled_condition: 0, label: null },
            { source_table: 'enrollment', column_name: 'crm_stage', enabled: 1, enabled_condition: 0, label: null },
        ]];
        if (/FROM document_condition/.test(sql)) return [[
            { slug: 'financeur-particulier', field: 'enrollment.financing', op: 'eq', value: '"PARTICULIER"' },
        ]];
        throw new Error(`requête inattendue : ${sql}`);
    },
};

test('une condition lit son champ même décoché ; l\'éditeur, lui, ne le propose plus', async () => {
    const lus = (await champsDesConditions(conn, 'org')).map((f) => f.key);
    assert.ok(lus.includes('enrollment.financing'), 'désigné par « Financeur Particulier » : lu malgré la case décochée');
    assert.ok(!lus.includes('enrollment.crm_stage'), 'décoché ET désigné par aucune condition : pas lu');
    const proposes = (await getEnabledFields(conn, 'org', 'condition')).map((f) => f.key);
    assert.ok(!proposes.includes('enrollment.financing'), 'l\'éditeur ne propose que ce qui est coché');
});

test('toutes les évaluations lisent les champs des conditions ; seul l\'éditeur s\'en tient aux cases', () => {
    /* Les cinq lieux qui ÉVALUENT une condition doivent voir les mêmes faits : si la garde lisait le
       financement et le parcours affiché non, elle pourrait exiger une variante que le parcours ne
       montre pas — l'impossible, par un autre chemin. */
    const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const f of ['controllers/espace.controller.js', 'lib/avancement.js', 'controllers/enrollment.controller.js',
        'controllers/company.controller.js', 'controllers/document.controller.js']) {
        const src = lire(f);
        assert.doesNotMatch(src, /getEnabledFields\([^)]*'condition'\)/, `${f} : une évaluation ne se limite pas aux champs cochés`);
        assert.match(src, /champsDesConditions\(conn, /, `${f} : les faits doivent couvrir les champs des conditions`);
    }
    assert.match(lire('controllers/condition.controller.js'), /getEnabledFields\([^)]*'condition'\)/,
        'l\'éditeur de conditions ne propose que les champs cochés');
});
