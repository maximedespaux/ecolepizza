/**
 * LE CODE DU TYPE N'EST PAS UN TITRE.
 *
 * LE DÉFAUT, vu le 2026-09-17 sur la fiche d'un stagiaire RS7404 : « R_GLEMENT_EXAMEN » et
 * « LIVRET_ACCUEIL » en guise de titres. Sans titre saisi, un document prenait le libellé de son
 * type dans une table qui ne connaît que les types d'origine ; pour un modèle créé par l'école —
 * dont l'écran fabrique le type à partir du slug — ou pour le livret d'accueil, il gardait le code
 * brut. En production : 9 documents partagés sur 1 226.
 *
 * Deux moitiés : le code, qui donne désormais l'intitulé du modèle ; la migration 165, qui
 * corrige les documents déjà créés.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* Les modèles de l'organisme, lus par loadOrgSteps au travers du module de base. Le document,
   lui, s'écrit par la connexion passée en argument : on capture son INSERT. */
const cheminDb = require.resolve('../config/database.js');
const LIGNES_MODELES = [
    { slug: 'r-glement-examen', label: 'Règlement examen', doc_type: null, signers: '[]' },
    { slug: 'devis-rs7404', label: 'Devis RS7404', doc_type: 'DEVIS', signers: '["ORG","STAGIAIRE"]' },
];
require.cache[cheminDb] = {
    id: cheminDb, filename: cheminDb, loaded: true,
    exports: {
        promise: () => ({ query: async (sql) => (/FROM document_template/.test(sql) ? [LIGNES_MODELES] : [[]]) }),
        query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
    },
};
const { prepareLearnerDoc } = require('../controllers/document.controller.js');

async function titreCree(champs) {
    let titre;
    const conn = {
        query: async (sql, params) => {
            if (/INSERT INTO generated_document/.test(sql)) titre = params[5];
            return [[]];
        },
    };
    await prepareLearnerDoc(conn, 'o1', { learnerId: 'l1', enrollmentIds: ['e1'], ...champs });
    return titre;
}

test('un modèle créé par l\'école donne son intitulé, pas son slug en capitales', async () => {
    // Le type tel que l'écran le fabrique : slug en capitales, tirets en soulignés.
    assert.strictEqual(await titreCree({ type: 'R_GLEMENT_EXAMEN', templateSlug: 'r-glement-examen' }), 'Règlement examen');
});

test('un modèle du socle absent de la table des types donne l\'intitulé du socle', async () => {
    assert.strictEqual(await titreCree({ type: 'LIVRET_ACCUEIL', templateSlug: 'livret-accueil' }), "Livret d'accueil");
});

test('les types connus gardent le titre qu\'ils ont toujours eu', async () => {
    /* Un devis RS7404 s'appelle « Devis » depuis toujours. Donner l'intitulé du modèle AVANT la
       table aurait renommé tous les nouveaux devis, contrats et conventions — ce que personne
       n'a demandé. */
    assert.strictEqual(await titreCree({ type: 'DEVIS', templateSlug: 'devis-rs7404' }), 'Devis');
});

test('un titre saisi l\'emporte, et le code reste le tout dernier recours', async () => {
    assert.strictEqual(await titreCree({ type: 'R_GLEMENT_EXAMEN', templateSlug: 'r-glement-examen', title: 'Règlement 2026' }), 'Règlement 2026');
    assert.strictEqual(await titreCree({ type: 'INCONNU', templateSlug: 'introuvable' }), 'INCONNU');
});

/* ─────────────── Migration 165 : les documents déjà créés ─────────────── */

const MIGRATIONS = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
const SQL = fs.readFileSync(path.join(MIGRATIONS, '165_titres_documents.sql'), 'utf8');
const INSTRUCTIONS = SQL.replace(/\/\*[\s\S]*?\*\//g, '');
const { DEFAULT_STEPS } = require('../lib/documents.js');

test('les intitulés recopiés dans la migration sont ceux du socle, et seulement ceux qui manquaient', () => {
    /* Recopier des libellés à la main dans du SQL, c'est prendre le risque d'une faute de frappe
       qui ne se verrait que sur les fiches, après coup. On les confronte donc au code. */
    const cas = [...INSTRUCTIONS.matchAll(/WHEN '([^']+)' THEN '((?:[^']|'')+)'/g)]
        .map(([, slug, label]) => [slug, label.replace(/''/g, "'")]);
    assert.ok(cas.length > 0, 'la migration doit porter les intitulés du socle');
    for (const [slug, label] of cas) {
        const etape = DEFAULT_STEPS.find((s) => s.slug === slug);
        assert.ok(etape, `${slug} n'est pas un modèle du socle`);
        assert.strictEqual(label, etape.label, `${slug} : intitulé différent de celui du code`);
    }
    // Exactement les modèles du socle dont le type n'a pas de libellé dans la table du code.
    const src = fs.readFileSync(path.join(__dirname, '../controllers/document.controller.js'), 'utf8');
    const table = src.slice(src.indexOf('const TYPE_LABELS'), src.indexOf('};', src.indexOf('const TYPE_LABELS')));
    const connus = new Set([...table.matchAll(/\b([A-Z_]+):/g)].map((m) => m[1]));
    const attendus = DEFAULT_STEPS.filter((s) => !connus.has(s.doc_type)).map((s) => s.slug).sort();
    assert.deepStrictEqual(cas.map(([slug]) => slug).sort(), attendus);
    // Et la liste du WHERE est la même que celle du CASE : un slug oublié d'un côté serait mis à NULL.
    const liste = INSTRUCTIONS.match(/d\.template_slug IN \(([^)]+)\)/)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1)).sort();
    assert.deepStrictEqual(liste, attendus);
});

test('seul le repli est renommé, jamais un titre saisi ni un document signé', () => {
    const miseAJour = INSTRUCTIONS.split(/;\s*/).filter((i) => /UPDATE generated_document/.test(i));
    assert.strictEqual(miseAJour.length, 2);
    for (const i of miseAJour) {
        /* Sur les octets : la collation ignore la casse, et « Cgv » saisi à la main passerait
           pour le repli « CGV ». */
        assert.match(i, /CAST\(d\.title AS BINARY\) = CAST\(d\.type AS BINARY\)/);
        /* Le titre entre dans le HTML dont une signature prend l'empreinte. */
        assert.match(i, /d\.status NOT IN \('SIGNE', 'ARCHIVE'\)/);
    }
    // L'intitulé propre à l'organisme passe avant celui du socle.
    assert.ok(INSTRUCTIONS.indexOf('JOIN document_template') < INSTRUCTIONS.indexOf('CASE d.template_slug'));
});

test('le revert existe, et ne fait rien', () => {
    const revert = fs.readFileSync(path.join(MIGRATIONS, '165_revert_titres_documents.sql'), 'utf8');
    assert.strictEqual(revert.replace(/\/\*[\s\S]*?\*\//g, '').trim(), 'DO 0;');
});
