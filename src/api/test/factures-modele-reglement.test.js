/**
 * /factures : LE MODÈLE ET LE RÈGLEMENT D'UN NOUVEAU DOCUMENT — demandé le 2026-09-28.
 *
 * LE DÉFAUT, relevé sur la page le jour même. « Nouveau document » ne demandait ni le modèle de
 * facture ni le règlement. FACT-2026-0004, brouillon, refusait de s'éditer : « Facture non générée :
 * 1 information(s) attendue(s) par le modèle sont vides — Moyens et montants réglés » ({Détail
 * règlement}), et rien sur l'écran ne permettait de la compléter.
 *
 * Ce fichier gèle :
 *   · à la création : le modèle (une FACTURE active, ou « automatique ») et le règlement (des parts
 *     dont la somme tombe sur le TTC du PDF), vérifiés AVANT toute écriture ;
 *   · le brouillon qui se complète — et le document émis qui ne se modifie plus ;
 *   · le TTC de l'écran, identique à celui du PDF (`ventilerTva`) au centime ;
 *   · l'écran : le modèle, le règlement « Ajouter un moyen », et le complément d'un brouillon.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const plat = (s) => s.replace(/\s+/g, ' ').trim();

/* ── Une fausse base ──────────────────────────────────────────────────────────────────────────── */
let b;
function base(o = {}) {
    b = { factures: {}, ecritures: [], sansColonnes: false, ...o };
    return b;
}
base();
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) b.ecritures.push({ q, p });
            if (/information_schema\.columns/.test(q)) return [b.sansColonnes ? [] : [{ 1: 1 }]];
            if (/^SELECT COUNT\(\*\) AS n FROM invoice WHERE organization_id = \? AND type = \?/.test(q)) return [[{ n: 3 }]];
            if (/^SELECT id, status FROM invoice WHERE id = \?/.test(q)) {
                const f = b.factures[p[0]];
                return [f ? [{ id: f.id, status: f.status }] : []];
            }
            if (/FROM invoice i LEFT JOIN enrollment e/.test(q) && /WHERE i\.id = \?/.test(q)) {
                const f = b.factures[p[0]];
                return [f ? [{ ...f, issue_ymd: '20260928', due_ymd: null, program_title: 'RS7404' }] : []];
            }
            if (/^INSERT INTO invoice \(/.test(q)) return [{ affectedRows: 1 }];
            return [[]];
        },
    }),
    query: (sql, p, cb) => {
        if (/^UPDATE invoice SET status/.test(plat(sql))) b.ecritures.push({ q: plat(sql), p });
        if (typeof cb === 'function') cb(null, { affectedRows: 1 });
    },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const MODELES = [
    { slug: 'facture-stagiaire', label: 'Facture stagiaire', doc_type: 'FACTURE', active: 1 },
    { slug: 'facture-ancienne', label: 'Ancienne facture', doc_type: 'FACTURE', active: 0 },
    { slug: 'devis-particulier', label: 'Devis particulier', doc_type: 'DEVIS', active: 1 },
];
const cheminModeles = require.resolve('../controllers/template.controller.js');
require.cache[cheminModeles] = {
    id: cheminModeles, filename: cheminModeles, loaded: true,
    exports: { loadOrgSteps: async () => MODELES, getTemplateContent: async () => null },
};
const { createInvoice, updateInvoice } = require('../controllers/invoice.controller.js');
const { ventilerTva } = require('../lib/facturx.js');

const ORG = 'org-1';
async function appeler(fn, req) {
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: ORG, id: 'u-bureau' }, params: {}, ...req }, res); }
    finally { console.error = avant; }
    await new Promise((f) => setImmediate(f));
    return r;
}
const creer = (corps) => appeler(createInvoice, { body: {
    type: 'FACTURE', tva_exoneree: 1, lines: [{ enrollment_id: null, description: 'Formation RS7404', amount_net: '300' }], ...corps,
} });
const ecrit = (motif) => b.ecritures.filter((e) => motif.test(e.q));

/* ── La création ──────────────────────────────────────────────────────────────────────────────── */

test('CRÉER avec un modèle et un règlement ventilé : les deux s\'enregistrent là où le PDF les lit', async () => {
    base();
    const r = await creer({
        template_slug: 'facture-stagiaire',
        payments: [{ method: 'Virement', amount: 100 }, { method: 'Chèque', amount: 200, bank: 'Crédit Agricole', cheque_number: '0012345' }],
    });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    assert.deepStrictEqual(ecrit(/^UPDATE invoice SET payment_method/)[0].p.slice(0, 1), ['Virement + Chèque']);
    assert.deepStrictEqual(JSON.parse(ecrit(/^UPDATE invoice SET payment_split/)[0].p[0]), [
        { method: 'Virement', amount: 100 },
        { method: 'Chèque', amount: 200, bank: 'Crédit Agricole', cheque_number: '0012345' },
    ], 'le détail remplit « Moyens et montants réglés », chèque compris');
    assert.strictEqual(ecrit(/^UPDATE invoice SET template_slug/)[0].p[0], 'facture-stagiaire');
});

test('LE RÈGLEMENT TOMBE SUR LE TTC DU PDF — 20 % sauf exonération —, sinon rien n\'est créé', async () => {
    base();
    // 300 € HT, TVA due : 360 € TTC. Régler 300 €, c'est oublier la TVA.
    const faux300 = await creer({ tva_exoneree: 0, payments: [{ method: 'CB', amount: 300 }] });
    assert.strictEqual(faux300.code, 422);
    assert.match(faux300.corps.error, /300,00 €.*360,00 €/, 'le message dit les deux montants');
    assert.strictEqual(ecrit(/^INSERT INTO invoice /).length, 0, 'refusé AVANT l\'écriture : aucun numéro consommé');
    assert.strictEqual((await creer({ tva_exoneree: 0, payments: [{ method: 'CB', amount: 360 }] })).code, 201);
    assert.strictEqual((await creer({ tva_exoneree: 1, payments: [{ method: 'CB', amount: 300 }] })).code, 201, 'exonéré : TTC = HT');
});

test('LE MODÈLE DOIT ÊTRE UNE FACTURE ACTIVE — refusé avant d\'écrire, pas découvert à l\'édition', async () => {
    for (const slug of ['devis-particulier', 'facture-ancienne', 'inconnu']) {
        base();
        const r = await creer({ template_slug: slug });
        assert.strictEqual(r.code, 422, slug);
        assert.strictEqual(ecrit(/^INSERT INTO invoice /).length, 0, `${slug} : rien d'écrit`);
    }
});

test('SANS MODÈLE NI RÈGLEMENT : le document se crée comme avant, rien de plus n\'est écrit', async () => {
    base();
    assert.strictEqual((await creer({})).code, 201);
    assert.deepStrictEqual(ecrit(/^UPDATE invoice SET/), [], '« automatique » et aucun règlement : les colonnes restent vides');
    // Avant les migrations 116 et 121 : le moyen s'écrit (colonne de base), le reste attend.
    base({ sansColonnes: true });
    assert.strictEqual((await creer({ template_slug: 'facture-stagiaire', payments: [{ method: 'CB', amount: 300 }] })).code, 201);
    assert.deepStrictEqual(ecrit(/^UPDATE invoice SET/).map((e) => e.q.split(' = ')[0]), ['UPDATE invoice SET payment_method']);
});

/* ── Le brouillon qui se complète ─────────────────────────────────────────────────────────────── */

const BROUILLON = { id: 'inv-4', number: 'FACT-2026-0004', status: 'BROUILLON', type: 'FACTURE', amount_net: '300.00', tva_exoneree: 1, tax_rate: null };

test('COMPLÉTER UN BROUILLON : c\'est ce qui débloque FACT-2026-0004', async () => {
    base({ factures: { 'inv-4': BROUILLON } });
    const r = await appeler(updateInvoice, { params: { id: 'inv-4' }, body: { template_slug: 'facture-stagiaire', payments: [{ method: 'Virement', amount: 300 }] } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.strictEqual(ecrit(/^UPDATE invoice SET payment_method/)[0].p[0], 'Virement');
    assert.strictEqual(ecrit(/^UPDATE invoice SET template_slug/)[0].p[0], 'facture-stagiaire');
    // Le TTC est celui du PDF : 300 € exonéré. 250 € ne boucle pas.
    base({ factures: { 'inv-4': BROUILLON } });
    assert.strictEqual((await appeler(updateInvoice, { params: { id: 'inv-4' }, body: { payments: [{ method: 'CB', amount: 250 }] } })).code, 422);
    assert.deepStrictEqual(ecrit(/^UPDATE invoice SET/), []);
});

test('UN DOCUMENT ÉMIS NE SE MODIFIE PLUS — et changer un statut marche comme avant', async () => {
    base({ factures: { 'inv-5': { ...BROUILLON, id: 'inv-5', status: 'EMISE' } } });
    const r = await appeler(updateInvoice, { params: { id: 'inv-5' }, body: { template_slug: 'facture-stagiaire' } });
    assert.strictEqual(r.code, 409);
    assert.deepStrictEqual(ecrit(/^UPDATE invoice SET/), []);
    assert.strictEqual((await appeler(updateInvoice, { params: { id: 'inconnu' }, body: { payments: [] } })).code, 404);
    base();
    assert.strictEqual((await appeler(updateInvoice, { params: { id: 'inv-4' }, body: { status: 'EMISE' } })).code, 200);
    assert.deepStrictEqual(ecrit(/^UPDATE invoice SET status/).map((e) => e.p[0]), ['EMISE']);
});

/* ── Le TTC de l'écran est celui du PDF ───────────────────────────────────────────────────────── */

test('LE TTC DE L\'ÉCRAN ET CELUI DU PDF, au centime, sur toute une plage de montants', async () => {
    const { ttcDe } = await import(`file://${path.join(RACINE, 'src/app/ui/lib/ttc.js')}`);
    const ecarts = [];
    for (let centimes = 0; centimes <= 200000; centimes += 37) {
        const ht = centimes / 100;
        for (const exo of [0, 1]) {
            const pdf = ventilerTva({ amountNet: ht, tvaExoneree: !!exo, taxRate: null, lines: [{ amount: ht }] }).grand;
            if (ttcDe(ht, exo) !== pdf) ecarts.push(`${ht} € (${exo ? 'exonéré' : 'TVA'}) : écran ${ttcDe(ht, exo)}, PDF ${pdf}`);
        }
    }
    assert.deepStrictEqual(ecarts.slice(0, 5), [], 'un centime d\'écart refuserait un règlement juste');
});

/* ── L'écran ──────────────────────────────────────────────────────────────────────────────────── */

test('L\'ÉCRAN : le modèle, le règlement « Ajouter un moyen », et le complément d\'un brouillon', () => {
    const page = lire('src/app/ui/pages/Factures.jsx');
    assert.match(page, /<SelectField label="Modèle de facture" value=\{form\.template_slug\} onChange=\{set\("template_slug"\)\}>/);
    assert.match(page, /\{modeles\.map\(\(t\) => <option key=\{t\.slug\} value=\{t\.slug\}>\{t\.label \|\| t\.slug\}<\/option>\)\}/, 'le nom du modèle, pas son identifiant');
    assert.match(page, /<PaiementSplit options=\{moyens\} total=\{formTtc\} rows=\{paiements\} onChange=\{setPaiements\} \/>/,
        'le composant de la caisse, avec « Ajouter un moyen » — pas une seconde version');
    assert.match(page, /template_slug: form\.template_slug \|\| null,\s+payments: parts,/);
    assert.match(page, /\{i\.status === "BROUILLON" && \(\s+<button type="button" onClick=\{\(\) => ouvrirComplement\(i\)\}>/,
        'un brouillon se complète depuis son menu');
    assert.match(page, /manques\.facture\?\.status === "BROUILLON"/, 'et depuis le message qui dit ce qui manque');
    assert.match(page, /await updateInvoice\(complement\.inv\.id, \{ template_slug: complement\.modele \|\| null, payments: parts \}\)/);
    // La liste porte de quoi pré-remplir le complément, quelles que soient les migrations jouées.
    assert.match(plat(lire('src/api/controllers/invoice.controller.js')), /SELECT i\.\*, i\.id, i\.type, i\.number/);
});
