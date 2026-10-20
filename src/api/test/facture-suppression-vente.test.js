/**
 * SUPPRIMER UNE FACTURE BOUTIQUE RETIRE SA VENTE DE LA COMPTABILITÉ — relevé par l'école le
 * 2026-10-20 : « j'ai supprimé une facture, mais le montant est toujours là » (58 € en « Ventes de
 * matériel » sur la page Comptabilité, facture disparue).
 *
 * LE DÉFAUT : une vente boutique/caisse crée DEUX écritures — une ou plusieurs lignes de vente
 * (`material_sale`, ce que compte la Comptabilité) ET la facture (`invoice`), liées par
 * `material_sale.invoice_id` (migration 069). `invoice_line` et `payment` partent par CASCADE quand
 * la facture est supprimée (clés étrangères, schema.sql) ; mais `material_sale` n'a PAS de clé
 * étrangère — sa ligne survivait, et son montant restait au chiffre d'affaires alors que la facture
 * n'existait plus.
 *
 * LA RÈGLE RETENUE (école, 2026-10-20) : supprimer la facture retire la vente liée, mais ne REMONTE
 * PAS le stock — comme la suppression d'une vente (`deleteSale`). Supprimer une facture corrige le
 * chiffre, pas l'inventaire.
 */
const test = require('node:test');
const assert = require('node:assert');

const ORG = '11111111-1111-4111-8111-111111111111';
const AUTRE_ORG = '22222222-2222-4222-8222-222222222222';
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();

let factures, ventes, requetes, journal, migration069;
function remettre() {
    factures = [
        { id: 'fb', organization_id: ORG, number: 'BQ-2026-0001', status: 'EMISE', billing_profile_id: null },
        { id: 'fm', organization_id: ORG, number: 'FACT-2026-0005', status: 'EMISE', billing_profile_id: null },
    ];
    ventes = [
        // Les deux lignes de la facture boutique « fb ».
        { id: 'v1', organization_id: ORG, invoice_id: 'fb', amount: '58.00', quantity: 1 },
        { id: 'v2', organization_id: ORG, invoice_id: 'fb', amount: '12.00', quantity: 2 },
        // Une vente d'une AUTRE facture du même organisme : ne doit jamais partir.
        { id: 'v3', organization_id: ORG, invoice_id: 'autre', amount: '9.00', quantity: 1 },
        // Une vente d'un AUTRE organisme, même id de facture : cloisonnement, ne doit jamais partir.
        { id: 'v4', organization_id: AUTRE_ORG, invoice_id: 'fb', amount: '99.00', quantity: 1 },
    ];
    requetes = []; journal = []; migration069 = true;
}

async function requete(sql, params) {
    const q = plat(sql);
    requetes.push({ q, params });
    if (/information_schema\.columns/.test(q)) { // colonneExiste(table, colonne)
        const [table, colonne] = params;
        const ok = migration069 && table === 'material_sale' && colonne === 'invoice_id';
        return [ok ? [{ ok: 1 }] : []];
    }
    if (/^SELECT id, number, status, billing_profile_id FROM invoice/.test(q)) {
        return [factures.filter((f) => f.id === params[0] && f.organization_id === params[1])];
    }
    if (/^SELECT id, number, status, NULL AS billing_profile_id FROM invoice/.test(q)) {
        return [factures.filter((f) => f.id === params[0] && f.organization_id === params[1]).map((f) => ({ ...f, billing_profile_id: null }))];
    }
    if (/^DELETE FROM invoice WHERE id = \? AND organization_id = \?/.test(q)) {
        const avant = factures.length;
        factures = factures.filter((f) => !(f.id === params[0] && f.organization_id === params[1]));
        return [{ affectedRows: avant - factures.length }];
    }
    if (/^DELETE FROM material_sale WHERE invoice_id = \? AND organization_id = \?/.test(q)) {
        const avant = ventes.length;
        ventes = ventes.filter((v) => !(v.invoice_id === params[0] && v.organization_id === params[1]));
        return [{ affectedRows: avant - ventes.length }];
    }
    return [[]];
}
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: requete }),
    query: (sql, params, cb) => { journal.push({ q: plat(sql), params }); const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };
const facturesCtrl = require('../controllers/invoice.controller.js');

async function supprimer(id, org = ORG) {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    requetes = [];
    await facturesCtrl.deleteInvoice({ user: { organization_id: org, id: 'u1' }, params: { id } }, res);
    return res;
}
const resteVente = (id) => ventes.some((v) => v.id === id);

test('LE CAS RELEVÉ : supprimer la facture boutique retire SES lignes de vente de la comptabilité', async () => {
    remettre();
    const res = await supprimer('fb');
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps.ventes_retirees, 2, 'les deux lignes de la facture partent');
    assert.ok(!resteVente('v1') && !resteVente('v2'), 'le montant ne reste plus en « Ventes de matériel »');
    assert.match(res.corps.message, /La vente liée a été retirée de la comptabilité\./);
    assert.ok(!factures.some((f) => f.id === 'fb'), 'la facture est supprimée');
});

test('CLOISONNEMENT : une vente d\'une autre facture, ou d\'un autre organisme, ne part jamais', async () => {
    remettre();
    await supprimer('fb');
    assert.ok(resteVente('v3'), 'une vente d\'une AUTRE facture du même organisme reste');
    assert.ok(resteVente('v4'), 'une vente d\'un AUTRE organisme (même id de facture) reste');
    // Le DELETE porte bien l'organisme, pas seulement l'id de facture.
    const del = requetes.find((r) => /^DELETE FROM material_sale/.test(r.q));
    assert.deepStrictEqual(del.params, ['fb', ORG]);
});

test('UNE FACTURE SANS VENTE LIÉE (formation, saisie manuelle) : aucune vente touchée', async () => {
    remettre();
    const res = await supprimer('fm');
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps.ventes_retirees, 0);
    assert.strictEqual(ventes.length, 4, 'les quatre ventes restent');
    assert.doesNotMatch(res.corps.message, /vente liée/, 'rien à signaler quand rien n\'est lié');
});

test('SANS LA MIGRATION 069, la suppression marche comme avant (aucune vente touchée)', async () => {
    remettre();
    migration069 = false;
    const res = await supprimer('fb');
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps.ventes_retirees, 0);
    assert.strictEqual(ventes.length, 4, 'sans la colonne invoice_id, on ne tente rien');
    assert.ok(!requetes.some((r) => /^DELETE FROM material_sale/.test(r.q)), 'aucun DELETE material_sale émis');
    assert.ok(!factures.some((f) => f.id === 'fb'), 'la facture est supprimée quand même');
});

test('UN IDENTIFIANT INCONNU ne supprime aucune vente', async () => {
    remettre();
    const res = await supprimer('nulle-part');
    assert.strictEqual(res.code, 404);
    assert.strictEqual(ventes.length, 4);
    assert.ok(!requetes.some((r) => /^DELETE/.test(r.q)), 'rien n\'est supprimé');
});
