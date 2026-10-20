/**
 * COMPTABILITÉ PAR ENTITÉ ÉMETTRICE (migration 210) — demandé le 2026-10-20.
 *
 * L'école facture sous DEUX entités (billing_profile : l'organisme, la boutique). La Comptabilité
 * additionnait tout l'organisme. On la filtre désormais par entité :
 *   · les FORMATIONS par la facture du dossier (invoice.billing_profile_id, 113) ;
 *   · les ventes, produits divers, dépenses et apports par leur colonne `billing_profile_id` (210) ;
 *   · le filtre est IGNORÉ tant que la 210 n'est pas jouée (la colonne manque) — l'écran le dit.
 *
 * Les apports de partenaires (« cadeaux ») et les dépenses se rattachent À LA MAIN à l'une ou
 * l'autre entité (pas le même but) ; une vente de caisse prend l'entité de sa facture.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { facturesDuDossierEntite, FACTURES_DU_DOSSIER } = require('../lib/inscriptionsFacturees.js');
const { colonneEntite } = require('../lib/entiteEcriture.js');

const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lireRacine = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', '..', rel), 'utf8');

/* ─── Domaine PUR : les formations se rattachent par la facture ─────────────────────────────────── */

test('facturesDuDossierEntite : sans entité, le fragment d\'origine, sans paramètre', () => {
    const r = facturesDuDossierEntite(null);
    assert.strictEqual(r.sql, FACTURES_DU_DOSSIER);
    assert.deepStrictEqual(r.params, []);
});

test('facturesDuDossierEntite : avec entité, la clause billing_profile_id et SON paramètre', () => {
    const r = facturesDuDossierEntite('bp1');
    assert.match(r.sql, /i\.billing_profile_id = \?/, 'ne compte que les factures de cette entité');
    assert.deepStrictEqual(r.params, ['bp1']);
    // Le `?` vit dans le SELECT : il doit rester AVANT les paramètres du WHERE (ordre des deux listes).
    assert.ok(r.sql.indexOf('billing_profile_id') < r.sql.indexOf('i.enrollment_id = e.id'));
});

/* ─── L'entité d'une écriture manuelle (tolérance 210 + cloisonnement) ──────────────────────────── */

function connEntite(colExists, belongs) {
    return { query: async (sql) => {
        if (/information_schema\.columns/.test(sql)) return [colExists ? [{ 1: 1 }] : []];
        if (/FROM billing_profile WHERE id/.test(sql)) return [belongs ? [{ ok: 1 }] : []];
        return [[]];
    } };
}

test('colonneEntite : sans la 210, la colonne n\'est PAS écrite ; sinon, l\'id s\'il est de l\'organisme', async () => {
    assert.deepStrictEqual(await colonneEntite(connEntite(false, true), 'o1', 'expense', 'bp1'),
        { exists: false, value: null }, 'colonne absente → on ne l\'ajoute pas à l\'INSERT');
    assert.deepStrictEqual(await colonneEntite(connEntite(true, true), 'o1', 'expense', 'bp1'),
        { exists: true, value: 'bp1' }, 'entité de l\'organisme → rattachée');
    assert.deepStrictEqual(await colonneEntite(connEntite(true, false), 'o1', 'expense', 'bpX'),
        { exists: true, value: null }, 'entité étrangère → null (jamais une erreur de clé étrangère)');
    assert.deepStrictEqual(await colonneEntite(connEntite(true, true), 'o1', 'expense', ''),
        { exists: true, value: null }, 'aucune entité choisie → non rattachée');
});

/* ─── getGestion : le filtre s'applique quand la 210 est jouée, et est ignoré sinon ─────────────── */

let COL_EXISTS = true;
let CAPTURED = [];
const fakeDb = { promise: () => ({ query: async (sql, params) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    CAPTURED.push({ s, params });
    if (/information_schema\.columns/.test(s)) return [COL_EXISTS ? [{ 1: 1 }] : []];
    if (/FROM material_sale/.test(s) && /SUM/.test(s)) return [[{ ca: 0 }]];
    if (/FROM revenue_extra/.test(s) && /SUM/.test(s)) return [[{ ca: 0 }]];
    if (/COUNT\(\*\) AS nb FROM training_session/.test(s)) return [[{ nb: 0 }]];
    return [[]];
} }) };
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: fakeDb };
const compta = require('../controllers/comptabilite.controller.js');

async function appeler(entite, colExists) {
    COL_EXISTS = colExists; CAPTURED = [];
    let corps = null;
    const req = { user: { organization_id: 'o1' }, query: { annee: 2026, mois: 0, entite } };
    const res = { status() { return this; }, json(b) { corps = b; return this; } };
    const err = console.error; console.error = () => {};
    try { await compta.getGestion(req, res); } finally { console.error = err; }
    return corps && corps.data;
}

test('getGestion : la 210 jouée → le filtre par entité s\'applique partout, et est annoncé', async () => {
    const data = await appeler('bp1', true);
    assert.strictEqual(data.parEntite, true, 'colonne présente → compta par entité possible');
    assert.strictEqual(data.entite, 'bp1', 'l\'entité consultée est renvoyée');
    // La vente boutique est filtrée par sa colonne, avec le bon paramètre.
    const mat = CAPTURED.find((q) => /FROM material_sale/.test(q.s) && /SUM/.test(q.s));
    assert.match(mat.s, /billing_profile_id = \?/);
    assert.ok(mat.params.includes('bp1'));
    // La formation est filtrée par la facture : l'entité est le PREMIER paramètre (le `?` est dans le SELECT).
    const dossiers = CAPTURED.find((q) => /FROM enrollment e/.test(q.s));
    assert.strictEqual(dossiers.params[0], 'bp1', 'l\'entité en tête des paramètres de la requête des dossiers');
    // Les apports (cadeaux) suivent aussi l'entité.
    const apports = CAPTURED.find((q) => /FROM partner_contribution c/.test(q.s));
    assert.match(apports.s, /c\.billing_profile_id = \?/);
});

test('getGestion : sans la 210, le filtre est IGNORÉ (tout l\'organisme) et l\'écran le sait', async () => {
    const data = await appeler('bp1', false);
    assert.strictEqual(data.parEntite, false, 'colonne absente → le sélecteur sera masqué');
    assert.strictEqual(data.entite, null, 'l\'entité demandée est ignorée');
    const mat = CAPTURED.find((q) => /FROM material_sale/.test(q.s) && /SUM/.test(q.s));
    assert.doesNotMatch(mat.s, /billing_profile_id/, 'aucune clause d\'entité sur une base sans la colonne');
});

/* ─── Les écritures PRENNENT leur entité (source) ───────────────────────────────────────────────── */

test('la caisse écrit l\'entité de la facture sur la vente ; les saisies manuelles la demandent', () => {
    const sale = lire('controllers/sale.controller.js');
    assert.match(sale, /const hasSaleEmitter = await hasColumn\(conn, 'material_sale', 'billing_profile_id'\);/);
    assert.match(sale, /if \(hasSaleEmitter\) \{ col\.push\('billing_profile_id'\); val\.push\(emetteur \? emetteur\.id : null\); \}/);

    // Dépense, produit divers, apport : colonne optionnelle via colonneEntite (tolérante à l'absence de 210).
    const co = lire('controllers/comptabilite.controller.js');
    assert.strictEqual((co.match(/colonneEntite\(conn, req\.user\.organization_id/g) || []).length, 2, 'dépense ET produit divers');
    assert.match(co, /if \(ent\.exists\) \{ col\.push\('billing_profile_id'\); val\.push\(ent\.value\); \}/);
    const partner = lire('controllers/partner.controller.js');
    assert.match(partner, /colonneEntite\(conn, req\.user\.organization_id, 'partner_contribution', b\.billing_profile_id\)/);
    assert.match(partner, /if \(ent\.exists\) \{ col\.push\('billing_profile_id'\); val\.push\(ent\.value\); \}/);
});

/* ─── La migration tague les QUATRE tables d'écritures ──────────────────────────────────────────── */

test('migration 210 : billing_profile_id sur les quatre tables, FK ON DELETE SET NULL', () => {
    const mig = lireRacine('database/migrations/210_compta_entite.sql');
    for (const t of ['material_sale', 'revenue_extra', 'expense', 'partner_contribution']) {
        assert.match(mig, new RegExp(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;`), `${t} taguée`);
        assert.match(mig, new RegExp(`REFERENCES billing_profile \\(id\\) ON DELETE SET NULL`), 'FK comme invoice');
    }
    // Rejouable : on retire la FK avant de la (re)poser.
    assert.match(mig, /DROP FOREIGN KEY IF EXISTS fk_material_sale_billing;/);
    const revert = lireRacine('database/migrations/210_revert_compta_entite.sql');
    assert.match(revert, /ALTER TABLE partner_contribution DROP COLUMN IF EXISTS billing_profile_id;/);
});
