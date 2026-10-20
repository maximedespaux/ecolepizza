/**
 * SUPPRIMER UNE VENTE BOUTIQUE SUPPRIME SA FACTURE — le miroir, demandé par l'école le 2026-10-20
 * après « supprimer une facture retire sa vente » : « fais la réciproque aussi ».
 *
 * Une facture boutique et ses lignes de vente (material_sale) sont une même transaction. Supprimer
 * une facture retire TOUTES ses ventes (lib/suppressionFacture.js, cœur partagé) ; supprimer une
 * vente retire sa facture — mais SEULEMENT quand c'était sa DERNIÈRE ligne : une facture couvre
 * parfois plusieurs articles, et elle reste la preuve des lignes encore présentes. La facture
 * emporte alors ses invoice_line et paiements par cascade.
 *
 * Une vente DIRECTE (createSale) ou RAPIDE (sellItem) n'a pas de facture (invoice_id nul) : rien ne
 * la suit. Sans la migration 069 (pas de lien vente ↔ facture), la vente part seule, comme avant.
 */
const test = require('node:test');
const assert = require('node:assert');

const ORG = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();

let factures, ventes, journal, requetes, migration069;
function remettre() {
    factures = [
        { id: 'fb', organization_id: ORG, number: 'BQ-2026-0001', status: 'EMISE', billing_profile_id: null },
        { id: 'fm', organization_id: ORG, number: 'BQ-2026-0002', status: 'EMISE', billing_profile_id: null },
    ];
    ventes = [
        { id: 'v1', organization_id: ORG, invoice_id: 'fb' },   // seule ligne de fb
        { id: 'v2', organization_id: ORG, invoice_id: 'fm' },   // fm a deux lignes
        { id: 'v3', organization_id: ORG, invoice_id: 'fm' },
        { id: 'vd', organization_id: ORG, invoice_id: null },   // vente directe, sans facture
    ];
    journal = []; requetes = []; migration069 = true;
}

async function requete(sql, params) {
    const q = plat(sql);
    requetes.push({ q, params });
    if (/information_schema\.columns/.test(q)) return [migration069 ? [{ x: 1 }] : []];
    if (/^SELECT invoice_id FROM material_sale WHERE id = \? AND organization_id = \?/.test(q)) {
        const v = ventes.find((x) => x.id === params[0] && x.organization_id === params[1]);
        return [v ? [{ invoice_id: v.invoice_id }] : []];
    }
    if (/^DELETE FROM material_sale WHERE id = \? AND organization_id = \?/.test(q)) {
        const avant = ventes.length;
        ventes = ventes.filter((x) => !(x.id === params[0] && x.organization_id === params[1]));
        return [{ affectedRows: avant - ventes.length }];
    }
    if (/^SELECT COUNT\(\*\) AS n FROM material_sale WHERE invoice_id = \? AND organization_id = \?/.test(q)) {
        const n = ventes.filter((x) => x.invoice_id === params[0] && x.organization_id === params[1]).length;
        return [[{ n }]];
    }
    // ── Cœur de suppression de facture (lib/suppressionFacture.js) ──
    if (/^SELECT id, number, status, billing_profile_id FROM invoice WHERE id = \? AND organization_id = \?/.test(q)) {
        return [factures.filter((f) => f.id === params[0] && f.organization_id === params[1])];
    }
    if (/^DELETE FROM invoice WHERE id = \? AND organization_id = \?/.test(q)) {
        const avant = factures.length;
        factures = factures.filter((f) => !(f.id === params[0] && f.organization_id === params[1]));
        return [{ affectedRows: avant - factures.length }];
    }
    if (/^DELETE FROM material_sale WHERE invoice_id = \? AND organization_id = \?/.test(q)) {
        const avant = ventes.length;
        ventes = ventes.filter((x) => !(x.invoice_id === params[0] && x.organization_id === params[1]));
        return [{ affectedRows: avant - ventes.length }];
    }
    return [[]];
}
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: requete }),
    query: (sql, params, cb) => { journal.push({ q: plat(sql), params }); const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };
const ventesCtrl = require('../controllers/sale.controller.js');

async function supprimer(id, org = ORG) {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    requetes = [];
    await ventesCtrl.deleteSale({ user: { organization_id: org, id: 'u1' }, params: { id } }, res);
    return res;
}
const resteV = (id) => ventes.some((v) => v.id === id);
const resteF = (id) => factures.some((f) => f.id === id);

test('LA DERNIÈRE LIGNE : supprimer la vente supprime sa facture, et c\'est journalisé', async () => {
    remettre();
    const res = await supprimer('v1');
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.ok(!resteV('v1'), 'la vente part');
    assert.ok(!resteF('fb'), 'la facture aussi : elle n\'a plus d\'objet');
    assert.strictEqual(res.corps.facture_supprimee, 'BQ-2026-0001');
    assert.match(res.corps.message, /La facture liée \(BQ-2026-0001\) a aussi été supprimée\./);
    const trace = journal.find((j) => /INSERT INTO audit_log/.test(j.q));
    assert.ok(trace && trace.params.includes('invoice.delete'), 'la suppression de la facture se trace');
});

test('PLUSIEURS LIGNES : une ligne supprimée garde la facture ; la DERNIÈRE l\'emporte', async () => {
    remettre();
    const r1 = await supprimer('v2');
    assert.strictEqual(r1.corps.facture_supprimee, null, 'il reste une ligne : la facture est conservée');
    assert.ok(resteF('fm') && resteV('v3') && !resteV('v2'));
    assert.strictEqual(r1.corps.message, 'Vente supprimée.');
    const r2 = await supprimer('v3');
    assert.strictEqual(r2.corps.facture_supprimee, 'BQ-2026-0002', 'la dernière ligne emporte la facture');
    assert.ok(!resteF('fm') && !resteV('v3'));
});

test('UNE VENTE DIRECTE (sans facture) : rien d\'autre ne bouge', async () => {
    remettre();
    const res = await supprimer('vd');
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.corps.facture_supprimee, null);
    assert.ok(!resteV('vd'));
    assert.ok(!requetes.some((r) => /^DELETE FROM invoice/.test(r.q)), 'aucune facture touchée');
    assert.strictEqual(factures.length, 2);
});

test('CLOISONNEMENT : une vente d\'un autre organisme n\'est pas supprimée, et sa facture reste', async () => {
    remettre();
    const res = await supprimer('v1', AUTRE); // v1 appartient à ORG, pas à AUTRE
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.corps.facture_supprimee, null, 'rien ne correspond dans cet organisme');
    assert.ok(resteV('v1') && resteF('fb'), 'la vente et la facture d\'ORG sont intactes');
});

test('SANS LA MIGRATION 069 : la vente part, la facture reste intacte', async () => {
    remettre();
    migration069 = false;
    const res = await supprimer('v1');
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.corps.facture_supprimee, null);
    assert.ok(!resteV('v1'), 'la vente est supprimée');
    assert.ok(resteF('fb'), 'sans le lien, on ne touche pas la facture');
    assert.ok(!requetes.some((r) => /SELECT invoice_id FROM material_sale/.test(r.q)), 'on ne lit même pas le lien');
});
