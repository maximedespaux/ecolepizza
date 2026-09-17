/**
 * UN MODÈLE SANS « TYPE » SE GÉNÈRE AUSSI POUR UNE ENTREPRISE.
 *
 * LE DÉFAUT, repéré le 2026-09-17 en lisant le code. Le champ « Type » d'un modèle est facultatif
 * (écran Modèles) : le « Règlement examen » créé par l'école n'en a pas. Mais la colonne
 * `generated_document.type` est NOT NULL (migration 010), et les deux générations d'une entreprise
 * y écrivaient `step.doc_type` tel quel — NULL. MariaDB refuse un NULL dans une colonne NOT NULL,
 * même hors mode strict pour une insertion d'une ligne : la génération répondait 500.
 *
 *   · documents DE GROUPE (`createCompanyDocument`, bouton « Générer » de la fiche entreprise) :
 *     tout modèle « entreprise » enregistré sans type ;
 *   · documents de CHAQUE STAGIAIRE du groupe (`generateGroupDocuments`) : la route existe, mais
 *     aucun écran ne l'appelle aujourd'hui.
 *
 * La fiche stagiaire, elle, n'a jamais eu le défaut : l'écran fabrique le type à partir du slug.
 * C'est ce repli que les deux routes reprennent, pour qu'un même modèle donne le même type partout.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { typeDuModele } = require('../lib/documents.js');

test('le type du modèle, ou à défaut son slug en capitales', () => {
    assert.strictEqual(typeDuModele({ slug: 'convention', doc_type: 'CONVENTION' }), 'CONVENTION');
    assert.strictEqual(typeDuModele({ slug: 'r-glement-examen', doc_type: null }), 'R_GLEMENT_EXAMEN');
    assert.strictEqual(typeDuModele({ slug: 'r-glement-examen', doc_type: '' }), 'R_GLEMENT_EXAMEN');
    // La colonne fait 40 caractères ; un slug en fait jusqu'à 60.
    assert.strictEqual(typeDuModele({ slug: 'accord-de-prise-en-charge-opco-pour-les-salaries' }).length, 40);
    assert.strictEqual(typeDuModele({}), 'AUTRE');
});

test('la fiche stagiaire fabrique le même type : un modèle, un type, quel que soit l\'écran', () => {
    /* Si l'une des deux règles change seule, un même modèle produirait deux types selon l'endroit
       d'où on le génère — et le repli par type (signataires, étape du parcours) ne relierait plus
       les documents du groupe à ceux de la fiche. */
    const fiche = fs.readFileSync(path.join(__dirname, '../../app/ui/pages/StagiaireDetail.jsx'), 'utf8');
    const derivations = fiche.match(/tpl\.doc_type \|\| tpl\.slug\.toUpperCase\(\)\.replace\(\/-\/g, "_"\)/g) || [];
    assert.strictEqual(derivations.length, 2, 'création ET import d\'un document');
});

/* ─────────────── Les deux routes, contre une base qui refuse le NULL ─────────────── */

const LIGNES_MODELES = [
    // Modèle « entreprise » enregistré sans type.
    { slug: 'accord-opco', label: 'Accord de prise en charge', doc_type: null, signers: '["ORG","ENTREPRISE"]', active: 1, company_level: 1 },
    // Modèle ordinaire sans type, comme le « Règlement examen » de production.
    { slug: 'regle-atelier', label: "Règles de l'atelier", doc_type: null, signers: '[]', active: 1, company_level: 0 },
];
let inserts = [];
/* La ligne insérée, colonne par colonne. Les positions ne suffisent pas : le document de groupe
   écrit `learner_id` en NULL LITTÉRAL, ce qui décale ses paramètres d'un cran par rapport au
   document d'un stagiaire. Lire `params[3]` dans les deux cas vérifiait le slug à la place du type. */
function ligneInseree(sql, params) {
    const [, cols, vals] = sql.match(/INSERT INTO generated_document \(([^)]*)\)\s*VALUES \(([^)]*)\)/);
    const valeurs = vals.split(',').map((v) => v.trim());
    let i = 0;
    return Object.fromEntries(cols.split(',').map((c, k) => [c.trim(), valeurs[k] === '?' ? params[i++] : valeurs[k]]));
}
async function repondre(sql, params) {
    if (/INSERT INTO generated_document/.test(sql)) {
        const ligne = ligneInseree(sql, params);
        // Ce que fait MariaDB : une insertion d'une ligne avec NULL dans une colonne NOT NULL échoue.
        if (ligne.type == null || ligne.type === 'NULL') {
            const e = new Error("Column 'type' cannot be null");
            e.code = 'ER_BAD_NULL_ERROR'; e.errno = 1048;
            throw e;
        }
        inserts.push({ type: ligne.type, slug: ligne.template_slug, titre: ligne.title });
        return [{ affectedRows: 1 }];
    }
    if (/FROM company WHERE id = \?/.test(sql)) return [[{ id: 'c1', opco: null }]];
    if (/SELECT id FROM training_session WHERE id = \?/.test(sql)) return [[{ id: 's1' }]];
    if (/FROM training_session s JOIN training_program p/.test(sql)) {
        return [[{ id: 's1', program_id: 'p1', program_code: 'RS7404', days: 5, hygiene: 0, rs_code: 'RS7404' }]];
    }
    if (/FROM enrollment e JOIN learner l ON l\.id = e\.learner_id/.test(sql)) {
        return [[{ id: 'e1', learner_id: 'l1', financing: 'OPCO', opco: 'OCAPIAT' }]];
    }
    if (/FROM document_template/.test(sql)) return [LIGNES_MODELES];
    return [[]];
}
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = {
    id: cheminDb, filename: cheminDb, loaded: true,
    exports: { promise: () => ({ query: repondre }), query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); } },
};
const { createCompanyDocument, generateGroupDocuments } = require('../controllers/company.controller.js');

async function appeler(fn, body) {
    inserts = [];
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {}; // la route journalise l'échec : pas ici
    try {
        await fn({ params: { id: 'c1' }, body, user: { organization_id: 'o1', id: 'u1' } }, res);
    } finally { console.error = erreurs; }
    return { code, corps };
}

test('document de groupe d\'un modèle « entreprise » sans type : créé, avec le type du slug', async () => {
    const { code, corps } = await appeler(createCompanyDocument, { session_id: 's1', template_slug: 'accord-opco' });
    assert.strictEqual(code, 201, JSON.stringify(corps));
    assert.deepStrictEqual(inserts, [{ type: 'ACCORD_OPCO', slug: 'accord-opco', titre: 'Accord de prise en charge — OCAPIAT' }]);
});

test('documents des stagiaires du groupe d\'un modèle sans type : créés, avec le même type', async () => {
    const { code, corps } = await appeler(generateGroupDocuments, { session_id: 's1', slug: 'regle-atelier' });
    assert.strictEqual(code, 201, JSON.stringify(corps));
    assert.deepStrictEqual(inserts, [{ type: 'REGLE_ATELIER', slug: 'regle-atelier', titre: "Règles de l'atelier" }]);
});
