/**
 * LA VIRGULE À LA CAISSE, À L'INVENTAIRE ET AUX FACTURES — suite de montant-saisi.test.js, où la
 * dépense « Facture Métro n°007505 », 315,93 € HT, était refusée en Comptabilité (2026-09-29).
 *
 * LE MÊME DÉFAUT vivait hors de la Comptabilité : chaque saisie d'argent lue par `Number()`, qui ne
 * connaît que le point — `Number("12,5")` vaut NaN. Selon l'endroit, la virgule était :
 *   · une remise de 0 % EN SILENCE — remise d'article et remise globale de la caisse
 *     (`Number(v) || 0`) : la vente partait au prix plein, et la facture avec ;
 *   · une part de règlement qui DISPARAISSAIT — caisse, factures, demandes boutique : écartée
 *     comme « invalide », tout le règlement retombait sur les autres moyens ;
 *   · une remise stagiaire PERDUE à la création d'un article (NaN, donc `null`), et un prix parti
 *     tel quel dans l'INSERT — « 39,90 » n'est pas un décimal SQL ;
 *   · une ligne de facture sans libellé ÉCARTÉE comme vide ;
 *   · REFUSÉE avec un message qui ne disait pas pourquoi — une vente, un article modifié, une
 *     ligne de facture, un paiement.
 *
 * ET À L'ÉCRAN : ces champs étaient en `type="number"`. Un champ numérique ne rend JAMAIS la virgule
 * au code : il la lit selon la langue de l'APPAREIL — relevé dans Chromium le 2026-09-30, la langue
 * de la page n'y change rien —, et là où elle n'est pas le séparateur décimal, « 12,5 » devient une
 * valeur VIDE : `Number("") || 0`, 0 %, sans un mot. Ils sont désormais en texte
 * (`inputMode="decimal"`), lus par lireMontant, et ce qui ne se lit pas est DIT.
 *
 * La base garde le point (`toFixed(2)`, cf. montants-virgule.test.js). Chaque test a été vu ROUGE
 * en réintroduisant le défaut qu'il gèle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { lireMontant } = require('../lib/montantSaisi.js');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lireUi = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
/** Le code seul : les commentaires RACONTENT l'ancien `type="number"`, ils ne doivent pas compter. */
const sansCommentaires = (f) => lireUi(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();

/* ── Une fausse base : réponses par motif, écritures capturées ───────────────────────────────── */
const ORG = 'org-1';
const ARTICLE = { name: 'Pelle à enfourner', sku: 'PE-33', category: 'Pelle', quantity: 10, unit_price: '100.00', tax_rate: '20.00' };
let requetes = [];
let ecritures = [];
function repondre(q) {
    if (/information_schema\.columns/i.test(q)) return [[{ 1: 1 }]]; // toutes les migrations jouées
    if (/^SELECT \* FROM shop_settings/.test(q)) return [[{ invoice_prefix: 'F', next_number: 7, tva_applies: 1, payment_methods: 'Espèces,CB' }]];
    if (/FROM inventory_item WHERE id = \? AND organization_id = \?/.test(q)) return [[{ ...ARTICLE }]];
    if (/FROM shop_request r JOIN learner/.test(q)) {
        return [[{ id: 'dem-1', ref: 'BQ-17', status: 'PRETE', invoice_id: null, first_name: 'Jean', last_name: 'Martin', company_id: null, company_name: null }]];
    }
    if (/FROM shop_request_line/.test(q)) {
        return [[{ label: 'Tablier', qty: 1, unit_price_ht: '50.00', tax_rate: '20.00', personalization: null, variant: null, discount_pct: null, unit_price_gross_ht: null }]];
    }
    if (/^SELECT id FROM invoice WHERE number = \?/.test(q)) return [[{ id: 'inv-bq' }]];
    if (/^SELECT amount_net FROM invoice WHERE id = \?/.test(q)) return [[{ amount_net: '315.93' }]];
    if (/^SELECT COALESCE\(SUM\(amount\),0\) AS paid/.test(q)) return [[{ paid: '0.00' }]];
    if (/^SELECT COUNT\(\*\) AS n FROM invoice/.test(q)) return [[{ n: 3 }]];
    if (/^(INSERT|UPDATE|DELETE)/.test(q)) return [{ affectedRows: 1 }];
    return [[]];
}
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            requetes.push({ q, p });
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) ecritures.push({ q, p });
            return repondre(q);
        },
    }),
    // Les routes à rappel (createSale, updateItem, logAudit).
    query: (sql, p, cb) => {
        const f = typeof p === 'function' ? p : cb;
        const q = plat(sql);
        requetes.push({ q, p });
        if (/^(INSERT|UPDATE|DELETE)/.test(q)) ecritures.push({ q, p });
        if (typeof f === 'function') f(null, /^SELECT/.test(q) ? [] : { affectedRows: 1 });
    },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const cheminModeles = require.resolve('../controllers/template.controller.js');
require.cache[cheminModeles] = {
    id: cheminModeles, filename: cheminModeles, loaded: true,
    exports: { loadOrgSteps: async () => [], getTemplateContent: async () => null },
};
const { checkout, createSale } = require('../controllers/sale.controller.js');
const { createItem, updateItem } = require('../controllers/inventory.controller.js');
const { createInvoice, recordPayment } = require('../controllers/invoice.controller.js');
const { invoiceShopRequest } = require('../controllers/shopRequest.controller.js');

async function appeler(fn, { body = {}, params = {} } = {}) {
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    requetes = []; ecritures = [];
    const avant = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: ORG, id: 'u-bureau' }, params, body }, res); }
    finally { console.error = avant; }
    await new Promise((f) => setImmediate(f));
    return r;
}
const ecrit = (motif) => ecritures.filter((e) => motif.test(e.q));
const dit = (r) => String(r.corps && (r.corps.error || r.corps.message));
/** Les valeurs d'un INSERT, par colonne — sans les places qui ne sont pas des `?` (CURDATE(), uuid()). */
function colonnes({ q, p }) {
    const [, cols, places] = /^INSERT INTO \w+ \(([^)]*)\) VALUES \((.*)\)$/.exec(q);
    const vals = places.split(/,\s*/);
    const o = {};
    let k = 0;
    cols.split(/,\s*/).forEach((c, i) => { if (vals[i] === '?') o[c] = p[k++]; });
    return o;
}
/** Rien n'est parti : ni vente, ni stock, ni facture, ni NUMÉRO consommé. */
function rienEcrit(quoi) {
    for (const motif of [/^INSERT INTO (material_sale|invoice|invoice_line|payment|inventory_item)\b/,
        /^UPDATE (inventory_item|shop_settings|invoice|shop_request)\b/]) {
        assert.deepStrictEqual(ecrit(motif).map((e) => e.q.slice(0, 40)), [], `${quoi} : rien ne doit être écrit`);
    }
}

/* ── LA CAISSE ─────────────────────────────────────────────────────────────────────────────────── */

const vente = (corps) => appeler(checkout, { body: {
    lines: [{ item_id: 'art-1', quantity: 2 }], status: 'IMPAYEE', invoice_template_slug: 'facture-boutique', ...corps,
} });

test('LA CAISSE — remise globale « 12,5 » : elle s\'applique, au lieu de 0 % en silence', async () => {
    const r = await vente({ discount: '12,5' });
    assert.strictEqual(r.code, 201, dit(r));
    // 100 € HT remisé de 12,5 % : 87,50 € l'unité, 175 € les deux.
    const ligne = colonnes(ecrit(/^INSERT INTO invoice_line/)[0]);
    assert.strictEqual(ligne.discount_pct, 12.5, 'la remise était lue 0 % : `Number("12,5") || 0`');
    assert.strictEqual(ligne.unit_price_ht, 87.5);
    assert.strictEqual(colonnes(ecrit(/^INSERT INTO invoice \(/)[0]).amount_net, '175.00', 'la base garde le point');

    const refus = await vente({ discount: 'douze' });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Remise globale illisible : écrivez-la par exemple 12,5\./);
    rienEcrit('remise globale illisible');
});

test('LA CAISSE — remise d\'article « 12,5 » : lue, et l\'illisible refusé en nommant l\'article', async () => {
    const r = await vente({ lines: [{ item_id: 'art-1', quantity: 1, discount_pct: '12,5' }] });
    assert.strictEqual(r.code, 201, dit(r));
    assert.strictEqual(colonnes(ecrit(/^INSERT INTO invoice_line/)[0]).discount_pct, 12.5);
    assert.strictEqual(colonnes(ecrit(/^INSERT INTO material_sale/)[0]).amount, '87.50');

    const refus = await vente({ lines: [{ item_id: 'art-1', quantity: 1, discount_pct: 'beaucoup' }] });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Remise illisible sur « Pelle à enfourner » : écrivez-la par exemple 12,5\./);
    rienEcrit('remise d\'article illisible');
});

test('LA CAISSE — règlement « 50,50 » en espèces : la part reste, au lieu de disparaître', async () => {
    // Une pelle à 100 € HT, TVA 20 % : 120 € à régler.
    const r = await vente({ lines: [{ item_id: 'art-1', quantity: 1 }], status: 'PAYEE',
        payments: [{ method: 'Espèces', amount: '50,50' }, { method: 'CB', amount: '69,50' }] });
    assert.strictEqual(r.code, 201, dit(r));
    const facture = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
    assert.deepStrictEqual(JSON.parse(facture.payment_split), [{ method: 'Espèces', amount: 50.5 }, { method: 'CB', amount: 69.5 }],
        'les deux parts disparaissaient, et la vente sortait sans règlement');
    assert.strictEqual(facture.payment_method, 'Espèces + CB');

    /* L'ILLISIBLE : la part « cinquante » était ÉCARTÉE, et les 120 € passaient en carte. */
    const refus = await vente({ lines: [{ item_id: 'art-1', quantity: 1 }], status: 'PAYEE',
        payments: [{ method: 'Espèces', amount: 'cinquante' }, { method: 'CB', amount: '120' }] });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Montant illisible pour « Espèces » : écrivez-le par exemple 315,93\./);
    rienEcrit('règlement illisible');
});

test('UNE VENTE SAISIE (POST /ventes) : « 315,93 » s\'enregistre, avec un point en base', async () => {
    const r = await appeler(createSale, { body: { product: 'Farine Caputo', amount: '315,93', quantity: 1 } });
    assert.strictEqual(r.code, 201, dit(r));
    assert.strictEqual(colonnes(ecrit(/^INSERT INTO material_sale/)[0]).amount, '315.93');

    const refus = await appeler(createSale, { body: { product: 'Farine', amount: 'trois cents' } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Montant illisible : écrivez-le par exemple 315,93\./, 'il disait « Montant invalide », sans dire pourquoi');
    assert.strictEqual(ecrit(/^INSERT INTO material_sale/).length, 0);
});

/* ── L'INVENTAIRE ─────────────────────────────────────────────────────────────────────────────── */

test('L\'INVENTAIRE — un article à « 39,90 », remisé de « 12,5 » % : ni prix brut en SQL, ni remise perdue', async () => {
    const r = await appeler(createItem, { body: { name: 'Pelle', unit_price: '39,90', tax_rate: '5,5', learner_discount_pct: '12,5', learner_discount_eur: '' } });
    assert.strictEqual(r.code, 201, dit(r));
    const art = colonnes(ecrit(/^INSERT INTO inventory_item/)[0]);
    assert.strictEqual(art.unit_price, '39.90', '« 39,90 » partait tel quel dans l\'INSERT');
    assert.strictEqual(art.tax_rate, '5.50', 'la TVA aussi — l\'écran la choisit dans une liste, pas l\'API');
    assert.strictEqual(art.learner_discount_pct, '12.50', 'la remise stagiaire disparaissait à la création');
    assert.strictEqual(art.learner_discount_eur, null);

    for (const [corps, motif] of [
        [{ unit_price: 'abc' }, /Prix illisible : écrivez-le par exemple 39,90\./],
        [{ unit_price: '39,90', learner_discount_eur: 'cinq' }, /Remise stagiaire illisible : écrivez-la par exemple 5,50\./],
    ]) {
        const refus = await appeler(createItem, { body: { name: 'Pelle', ...corps } });
        assert.strictEqual(refus.code, 422, JSON.stringify(corps));
        assert.match(dit(refus), motif);
        assert.strictEqual(ecrit(/^INSERT INTO inventory_item/).length, 0);
    }
});

test('L\'INVENTAIRE — modifier le prix en « 39,90 » et la remise en « 5,50 » € : accepté, et écrit avec un point', async () => {
    const r = await appeler(updateItem, { params: { id: 'art-1' },
        body: { name: 'Pelle', unit_price: '39,90', tax_rate: '5,5', learner_discount_pct: '', learner_discount_eur: '5,50' } });
    assert.strictEqual(r.code, 200, dit(r));
    const [maj] = ecrit(/^UPDATE inventory_item/);
    assert.match(maj.q, /learner_discount_pct = NULL/, 'l\'unité non retenue est effacée');
    for (const v of ['39.90', '5.50']) assert.ok(maj.p.includes(v), `${v} attendu dans ${JSON.stringify(maj.p)}`);
    assert.ok(maj.p.includes('5.50') && !maj.p.includes('5,5'), 'le taux de TVA aussi garde le point');

    const refus = await appeler(updateItem, { params: { id: 'art-1' }, body: { unit_price: 'abc' } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Prix illisible : écrivez-le par exemple 39,90\./, 'il disait « Valeur invalide pour unit_price. »');
    assert.strictEqual(ecrit(/^UPDATE inventory_item/).length, 0);
});

/* ── LES FACTURES ─────────────────────────────────────────────────────────────────────────────── */

const facture = (corps) => appeler(createInvoice, { body: { type: 'FACTURE', tva_exoneree: 1, ...corps } });

test('LES FACTURES — une ligne à « 1 234,56 » s\'enregistre ; une ligne illisible n\'est plus écartée', async () => {
    const r = await facture({ lines: [{ enrollment_id: null, description: 'Formation RS7404', amount_net: '1 234,56' }] });
    assert.strictEqual(r.code, 201, dit(r));
    assert.strictEqual(colonnes(ecrit(/^INSERT INTO invoice_line/)[0]).amount_net, '1234.56');
    assert.strictEqual(ecrit(/^INSERT INTO invoice \(/)[0].p[7], '1234.56', 'le total, avec un point');

    const seul = await facture({ amount_net: '315,93' });
    assert.strictEqual(seul.code, 201, dit(seul));
    assert.strictEqual(ecrit(/^INSERT INTO invoice \(/)[0].p[7], '315.93');

    /* Une ligne SANS LIBELLÉ au montant illisible passait pour une ligne VIDE, et la facture
       partait sans elle — ici, 300 € au lieu de 1 300. */
    const refus = await facture({ lines: [
        { enrollment_id: null, description: 'Formation RS7404', amount_net: '300' },
        { enrollment_id: null, description: '', amount_net: 'mille' },
    ] });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Montant de ligne invalide : écrivez un nombre positif, par exemple 315,93\./);
    rienEcrit('ligne illisible');
});

test('LES FACTURES — un règlement de « 1 234,56 » est gardé ; l\'illisible est refusé avant tout numéro', async () => {
    const lignes = [{ enrollment_id: null, description: 'Formation RS7404', amount_net: '1234,56' }];
    const r = await facture({ lines: lignes, payments: [{ method: 'Virement', amount: '1 234,56' }] });
    assert.strictEqual(r.code, 201, dit(r));
    const [split] = ecrit(/^UPDATE invoice SET payment_split/);
    assert.ok(split, 'la part disparaissait : le document sortait sans règlement');
    assert.deepStrictEqual(JSON.parse(split.p[0]), [{ method: 'Virement', amount: 1234.56 }]);

    const refus = await facture({ lines: lignes, payments: [{ method: 'CB', amount: 'tout' }] });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Montant illisible pour « CB » : écrivez-le par exemple 315,93\./);
    rienEcrit('règlement illisible');
});

test('LES FACTURES — un paiement de « 315,93 » s\'encaisse, avec un point en base', async () => {
    const r = await appeler(recordPayment, { params: { id: 'inv-1' }, body: { amount: '315,93' } });
    assert.strictEqual(r.code, 201, dit(r));
    assert.deepStrictEqual(ecrit(/^INSERT INTO payment/)[0].p.slice(1), ['inv-1', '315.93']);

    const refus = await appeler(recordPayment, { params: { id: 'inv-1' }, body: { amount: 'abc' } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Montant invalide : écrivez un nombre strictement positif, par exemple 315,93\./);
    assert.strictEqual(ecrit(/^INSERT INTO payment/).length, 0);
});

/* ── LES DEMANDES BOUTIQUE ────────────────────────────────────────────────────────────────────── */

test('LES DEMANDES BOUTIQUE — « 30,50 » en espèces reste dans le règlement ; l\'illisible ne consomme aucun numéro', async () => {
    const r = await appeler(invoiceShopRequest, { params: { id: 'dem-1' },
        body: { payments: [{ method: 'Espèces', amount: '30,50' }, { method: 'CB', amount: '29,50' }] } });
    assert.strictEqual(r.code, 201, dit(r));
    const inv = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
    assert.deepStrictEqual(JSON.parse(inv.payment_split), [{ method: 'Espèces', amount: 30.5 }, { method: 'CB', amount: 29.5 }]);

    const refus = await appeler(invoiceShopRequest, { params: { id: 'dem-1' },
        body: { payments: [{ method: 'Espèces', amount: 'trente' }, { method: 'CB', amount: '29,50' }] } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Montant illisible pour « Espèces » : écrivez-le par exemple 315,93\./);
    assert.ok(!requetes.some((x) => /SELECT number FROM invoice/.test(x.q)), 'refusé AVANT le numéro : la séquence ne souffre aucun trou');
    rienEcrit('règlement boutique illisible');
});

/* ── L'ÉCRAN ──────────────────────────────────────────────────────────────────────────────────── */

/** Évalue un bloc PUR d'un fichier de l'écran (entre deux repères), `lireMontant` passé en
 *  argument : la copie du serveur, que montant-saisi.test.js tient d'accord avec celle de l'écran. */
function bloc(fichier, debut, fin, noms) {
    const src = lireUi(fichier);
    const i = src.indexOf(debut);
    const j = src.indexOf(fin, i);
    assert.ok(i >= 0 && j > i, `${fichier} : bloc introuvable (${debut})`);
    const code = src.slice(i, j).replace(/^export /gm, '');
    return new Function('lireMontant', `${code}\nreturn { ${noms.join(', ')} };`)(lireMontant);
}

test('L\'ÉCRAN — le règlement ventilé (caisse, factures, boutique) lit « 300,50 », et DIT l\'illisible', () => {
    const { resolvePayments } = bloc('components/PaiementSplit.jsx', 'export const estCheque', 'export default', ['resolvePayments']);
    const ok = resolvePayments([{ method: 'Espèces', amount: '300,50' }, { method: 'CB', amount: '' }], 1000);
    assert.deepStrictEqual(ok.parts, [{ method: 'Espèces', amount: 300.5 }, { method: 'CB', amount: 699.5 }],
        '« 300,50 » valait 0 : les 1000 € passaient en carte');
    assert.ok(ok.valid);

    const ko = resolvePayments([{ method: 'Espèces', amount: 'trois cents' }, { method: 'CB', amount: '' }], 1000);
    assert.ok(!ko.valid, 'une répartition illisible ne doit pas partir');
    assert.strictEqual(ko.illisible, 'Montant illisible pour « Espèces » : écrivez-le par exemple 300,50.');
    assert.strictEqual(ko.motif, ko.illisible, 'et l\'écran le dit, au lieu de « dépasse le total »');

    const src = sansCommentaires('components/PaiementSplit.jsx');
    assert.doesNotMatch(src, /type="number"/, 'un champ numérique rend « 300,50 » VIDE selon la langue de l\'appareil');
    assert.match(src, /<input className="inp mono" inputMode="decimal"/);

    /* LES DEMANDES BOUTIQUE envoyaient les parts sans regarder : une part illisible, lue 0, y
       disparaissait, et le dernier moyen prenait tout. Le bouton attend désormais. */
    assert.match(lireUi('pages/DemandesBoutique.jsx'),
        /disabled=\{busy \|\| !!resolvePayments\(paiements, totalTtc\)\.illisible\}/);
});

test('L\'ÉCRAN — la caisse lit « 12,5 », borne sous les yeux, et bloque l\'encaissement sur l\'illisible', () => {
    const { remiseSaisie, tauxApplique, borneRemise } = bloc('pages/Ventes.jsx', 'const remiseSaisie', 'const TABS',
        ['remiseSaisie', 'tauxApplique', 'borneRemise']);
    assert.strictEqual(tauxApplique('12,5'), 12.5);
    assert.strictEqual(tauxApplique(''), 0);
    assert.strictEqual(tauxApplique('abc'), 0, 'l\'illisible n\'applique rien…');
    assert.ok(Number.isNaN(remiseSaisie('abc')), '… mais se signale');
    assert.strictEqual(borneRemise('150'), '100', 'ramenée à sa borne, comme le faisait le champ numérique');
    assert.strictEqual(borneRemise('12,'), '12,', 'une saisie en cours reste telle quelle');

    const src = lireUi('pages/Ventes.jsx');
    assert.match(src, /const remiseGlobale = tauxApplique\(discount\);/);
    assert.match(src, /cart\.some\(\(l\) => tauxApplique\(l\.disc\) > 0\)/);
    assert.match(src, /discount_pct: tauxApplique\(l\.disc\)/);
    assert.match(src, /onChange=\{\(e\) => setLine\(l\.item_id, \{ disc: borneRemise\(e\.target\.value\) \}\)\}/);
    assert.doesNotMatch(src, /Number\(l\.disc\)|Number\(discount\)/, 'plus aucune remise lue par `Number()`');
    // Les deux champs de remise : du texte, pas un champ numérique.
    assert.match(src, /<input inputMode="decimal" autoComplete="off" value=\{l\.disc\}/);
    assert.match(src, /inputMode="decimal" autoComplete="off" placeholder="0"\s+value=\{remiseDeLigne \? "" : discount\}/);
    assert.match(src, /disabled=\{!!illisible \|\| trop \|\| sansModele\}/, 'l\'illisible bloque l\'encaissement');
});

test('L\'ÉCRAN — une ligne de facture à « 1 234,56 » compte au total, et part LUE', () => {
    const { montantDeLigne, montantIllisible } = bloc('pages/Factures.jsx', 'const montantDeLigne', 'const makeEmpty',
        ['montantDeLigne', 'montantIllisible']);
    assert.strictEqual(montantDeLigne({ amount_net: '1 234,56' }), 1234.56);
    assert.strictEqual(montantDeLigne({ amount_net: '' }), 0);
    assert.ok(montantIllisible({ amount_net: 'mille' }));
    assert.ok(!montantIllisible({ amount_net: '' }), 'une case vide n\'est pas une faute');

    const src = lireUi('pages/Factures.jsx');
    assert.doesNotMatch(src, /Number\(l\.amount_net\)/);
    assert.match(src, /lines: form\.lines\.map\(\(l\) => \(\{ \.\.\.l, amount_net: l\.amount_net === "" \? "" : montantDeLigne\(l\) \}\)\)/);
    assert.match(src, /aria-label="Montant HT" inputMode="decimal"/);
    assert.match(src, /message: motif \|\| "La répartition du règlement dépasse le total à régler\."/);
});

test('L\'ÉCRAN — l\'inventaire : prix et remise en texte, estimation TTC lue en français', () => {
    const { ttc } = bloc('pages/Inventaire.jsx', 'const ttc', 'function stockState', ['ttc']);
    assert.strictEqual(Math.round(ttc('39,90', '20') * 100) / 100, 47.88, 'l\'estimation affichait « 0 € »');
    assert.strictEqual(ttc('39.90', '20.00').toFixed(2), '47.88', 'un prix de la base, avec son point');

    const src = sansCommentaires('pages/Inventaire.jsx');
    assert.doesNotMatch(src, /type="number" step="0\.01"/, 'le prix n\'est plus un champ numérique');
    assert.doesNotMatch(src, /type="number" min="0" step="0\.5"/, 'la remise non plus');
    assert.strictEqual((src.match(/label="Prix unitaire HT \(€\)" inputMode="decimal"/g) || []).length, 2, 'création ET modification');
    assert.match(src, /unit_price: montantEnSaisie\(item\.unit_price\)/);
    // Un prix illisible n'affiche pas de TTC — « 39,9x » donnait « TTC : 0 € ».
    assert.match(src, /\{Number\.isFinite\(lireMontant\(editing\.unit_price\)\) \? <span>TTC/);
    assert.match(src, /\{status\?\.type === "error" && <StatusMessage status=\{status\} \/>\}/,
        'le refus se lit DANS la fenêtre, pas derrière elle');
});

test('L\'ÉCRAN — pré-remplir un champ : « 39.90 » de la base s\'affiche « 39,90 », et se relit à l\'identique', async () => {
    const { montantEnSaisie } = await import(pathToFileURL(path.join(UI, 'lib', 'montantSaisi.js')).href);
    assert.strictEqual(montantEnSaisie('39.90'), '39,90');
    assert.strictEqual(montantEnSaisie(1234.5), '1234,5');
    assert.strictEqual(montantEnSaisie(null), '');
    for (const v of ['39.90', 1234.5, 0, '1500.00']) assert.strictEqual(lireMontant(montantEnSaisie(v)), Number(v), String(v));

    const L = await import(pathToFileURL(path.join(UI, 'lib', 'lignesFacture.js')).href);
    assert.strictEqual(L.ligneDuDossier({ enrollment_id: 'e1', montant: 1234.5 }).amount_net, '1234,5');
});
