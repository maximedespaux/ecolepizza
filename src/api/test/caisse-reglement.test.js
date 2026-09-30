/**
 * LA CAISSE ENCAISSE CE QU'ELLE AFFICHE, ET UN REFUS N'ÉCRIT RIEN — relevé le 2026-09-30.
 *
 * POST /api/ventes/checkout, `checkout` dans sale.controller.js. Deux défauts, qui se nourrissaient :
 *
 * 1. LE REFUS ARRIVAIT APRÈS LES ÉCRITURES. « La répartition des paiements (…) ne correspond pas au
 *    total à régler (…) » (422) se vérifiait APRÈS la prise du numéro de facture, le décrément du
 *    stock et l'écriture des ventes (material_sale, que la comptabilité lit, et qui pointaient vers
 *    une facture jamais créée). Aucune transaction : un refus laissait un trou dans la séquence des
 *    factures, un stock faux, des ventes fantômes — et chaque nouvel essai recommençait.
 *
 * 2. CE REFUS TOMBAIT SUR DES VENTES JUSTES. L'écran (Ventes.jsx : `ttc: ht + tva`, puis
 *    `resolvePayments`, qui arrondit le solde par `Math.round(x * 100) / 100`) et le serveur
 *    (`Number((totalHT + totalTVA).toFixed(2))`) n'arrondissaient pas pareil quand la TVA tombait sur
 *    un demi-centime. Un article à 1,00 € HT à 5,5 %, réglé en un seul moyen : l'écran envoyait 1,06,
 *    le serveur calculait 1,05 → 422, écritures faites. Et `Math.abs(somme - ttc) > 0.01` n'était pas
 *    une tolérance d'un centime : 1,06 − 1,05 vaut 0,010000000000000009. Pour un article seul entre
 *    0,05 et 200 € HT : 16 prix refusés à 5,5 %, 296 à 10 %, aucun à 20 %. L'opérateur n'avait aucun
 *    recours : le solde du dernier moyen ne se saisit pas.
 *
 * Et le message imprimait « 150.00 € », avec un point.
 *
 * Ce fichier gèle :
 *   · un refus, QUEL QU'IL SOIT, n'écrit rien — ni numéro (émettrice ou compteur de la boutique), ni
 *     stock, ni vente, ni facture ;
 *   · le règlement que l'ÉCRAN calcule, le serveur l'accepte, et annonce le MÊME total, au centime —
 *     sur une plage de prix et de taux, par le vrai code de la page et le vrai contrôleur ;
 *   · les deux copies de la règle (`totalFacture`, lib/ttc.js, écran et serveur) rendent la même
 *     chose, et un article seul s'encaisse au total que le PDF imprimera ;
 *   · sur PLUSIEURS TAUX aussi, la caisse encaisse le total de la FACTURE, confronté au PDF relu dans
 *     ce qui a été écrit. Tranché le 2026-09-30 : la règle de la caisse (lib/totalCaisse.js, retirée)
 *     arrondissait la TVA une fois sur le tout, la facture l'arrondit par taux — un centime d'écart
 *     sur près d'une vente à deux taux sur quatre ;
 *   · et sur plusieurs lignes d'un même taux, pour une facture née depuis la migration 192 (TVA en
 *     centimes entiers, cf. facture-tva-centimes.test.js) : l'écran, le serveur et le PDF comptent
 *     alors tous en centimes — et sans elle, rien ne change ;
 *   · l'écart toléré se compte en centimes entiers, et le message parle français.
 *
 * Chaque test a été vu ROUGE en réintroduisant le défaut qu'il gèle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { lireMontant } = require('../lib/montantSaisi.js');
const { totalFacture } = require('../lib/ttc.js');
const { ventilerTva } = require('../lib/facturx.js');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lireUi = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
/** Le code seul : les commentaires RACONTENT l'ancien calcul, ils ne doivent pas compter. */
const sansCommentaires = (f) => lireUi(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
/** La copie de l'écran de la règle, et son format d'affichage : des modules ESM. */
const ecran = import(pathToFileURL(path.join(UI, 'lib', 'ttc.js')).href);
const format = import(pathToFileURL(path.join(UI, 'lib', 'format.js')).href);

/* ── Une fausse base : réponses par motif, écritures capturées ───────────────────────────────── */
const ORG = 'org-1';
/** Un article tel que la base le rend : les décimaux en texte. */
const article = (name, prix, taux, stock = 10) => ({ name, sku: null, category: 'Matériel', quantity: stock, unit_price: prix, tax_rate: taux });
const PELLE = article('Pelle à enfourner', '100.00', '20.00');                  // 120,00 € TTC
const TABLIER = article('Tablier', '50.00', '20.00');                           // 60,00 € TTC
const BROSSE = article('Brosse à four', '1.00', '5.50');                        // 1,055 € : un demi-centime
const EMETTEUR = { id: 'emet-1', organization_id: ORG, is_default: 1, invoice_prefix: 'VT', next_number: 12, number_format: null, tva_applies: 1 };
const REGLAGES = { invoice_prefix: 'F', next_number: 7, tva_applies: 1, payment_methods: 'Espèces,CB,Chèque' };

let b;
function base(o = {}) {
    b = { articles: { pelle: PELLE, tablier: TABLIER, brosse: BROSSE }, emetteur: null, reglages: REGLAGES,
        connus: { learner: ['stag-1'], company: ['ent-1'] }, requetes: [], ecritures: [], ...o };
    return b;
}
base();
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            b.requetes.push({ q, p });
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) { b.ecritures.push({ q, p }); return [{ affectedRows: 1 }]; }
            // Toutes les migrations jouées, sauf les colonnes nommées dans `sans` (hasColumn passe [table, colonne]).
            if (/information_schema\.columns/i.test(q)) return [(b.sans || []).includes(p[1]) ? [] : [{ 1: 1 }]];
            if (/^SELECT \* FROM shop_settings/.test(q)) return [[{ ...b.reglages }]];
            if (/^SELECT \* FROM billing_profile/.test(q)) return [b.emetteur ? [{ ...b.emetteur }] : []];
            if (/FROM inventory_item WHERE id = \? AND organization_id = \?/.test(q)) {
                const a = b.articles[p[0]];
                return [a ? [{ ...a }] : []];
            }
            const appartient = /^SELECT 1 AS ok FROM (learner|company) WHERE id = \?/.exec(q);
            if (appartient) return [b.connus[appartient[1]].includes(p[0]) ? [{ ok: 1 }] : []];
            return [[]];
        },
    }),
    // Le journal d'audit (logAudit), à rappel : il n'est pas une écriture de la vente.
    query: (sql, p, cb) => { const f = typeof p === 'function' ? p : cb; if (typeof f === 'function') f(null, { affectedRows: 1 }); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const cheminModeles = require.resolve('../controllers/template.controller.js');
require.cache[cheminModeles] = {
    id: cheminModeles, filename: cheminModeles, loaded: true,
    exports: { loadOrgSteps: async () => [], getTemplateContent: async () => null },
};
const { checkout, getShopSettings } = require('../controllers/sale.controller.js');

/** POST /api/ventes/checkout. Par défaut : une pelle, payée, sous le modèle de facture choisi. */
async function encaisser(corps, o) {
    base(o);
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try {
        await checkout({ user: { organization_id: ORG, id: 'u-caisse' }, body: {
            lines: [{ item_id: 'pelle', quantity: 1 }], status: 'PAYEE', invoice_template_slug: 'facture-boutique', ...corps,
        } }, res);
    } finally { console.error = avant; }
    return r;
}
const ecrit = (motif) => b.ecritures.filter((e) => motif.test(e.q));
const dit = (r) => String(r.corps && (r.corps.error || r.corps.message));
/** Les valeurs d'un INSERT, par colonne — sans les places qui ne sont pas des `?` (CURDATE()). */
function colonnes({ q, p }) {
    const [, cols, places] = /^INSERT INTO \w+ \(([^)]*)\) VALUES \((.*)\)$/.exec(q);
    const vals = places.split(/,\s*/);
    const o = {};
    let k = 0;
    cols.split(/,\s*/).forEach((c, i) => { if (vals[i] === '?') o[c] = p[k++]; });
    return o;
}
/** Rien n'est parti : ni numéro (émettrice ou compteur de la boutique), ni stock, ni vente, ni facture. */
function rienEcrit(quoi) {
    assert.deepStrictEqual(b.ecritures.map((e) => e.q.slice(0, 48)), [], `${quoi} : rien ne doit être écrit`);
}
const centimes = (n) => Math.round(n * 100);
/** Le total que le PDF imprimera, relu comme `loadInvoiceData` le relit dans ce qui a été ÉCRIT :
 *  les décimaux de la base en texte, la TVA par `ventilerTva` — en centimes entiers si la facture est
 *  née avec `tva_centimes` (migration 192). */
function totalDuPdf() {
    const f = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
    const lignes = ecrit(/^INSERT INTO invoice_line/).map(colonnes);
    const enBase = (n) => Number(Number(n).toFixed(2));
    return ventilerTva({
        amountNet: f.amount_net, tvaExoneree: !!Number(f.tva_exoneree), taxRate: f.tax_rate ?? null,
        tvaCentimes: !!Number(f.tva_centimes || 0),
        lines: lignes.map((l) => ({ amount: enBase(l.amount_net), taxRate: l.tax_rate == null ? null : enBase(l.tax_rate) })),
    }).grand;
}
/** La règle de la caisse AVANT le 2026-09-30 (lib/totalCaisse.js, retirée), pour mémoire : la TVA
 *  exacte en entiers, arrondie UNE fois sur le tout, le demi-centime vers le haut. */
function totalArrondiUneFois(lignes) {
    let ht = 0, tva = 0;
    for (const l of lignes) {
        const c = Math.round(Number(l.ht) * 100);
        ht += c;
        tva += c * Math.round(Number(l.taux || 0) * 1000);
    }
    return (ht + Math.floor((tva + 50000) / 100000)) / 100;
}

/* ── L'ÉCRAN, PAR SON PROPRE CODE ─────────────────────────────────────────────────────────────── */

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
const { resolvePayments } = bloc('components/PaiementSplit.jsx', 'export const estCheque', 'export default', ['resolvePayments']);
const { tauxApplique, lignesDuPanier } = bloc('pages/Ventes.jsx', 'const remiseSaisie', 'function Ventes()', ['tauxApplique', 'lignesDuPanier']);
/** Le total du panier, par SA formule, lue dans la page (le `useMemo` nommé `totals`). */
const totauxDeLaPage = (() => {
    const m = /const totals = useMemo\(\(\) => (\(\{[\s\S]*?\}\)), \[cart, remiseDeLigne, remiseGlobale, tvaApplies, tvaCentimes\]\);/.exec(lireUi('pages/Ventes.jsx'));
    assert.ok(m, 'Ventes.jsx : le total du panier doit rester le `useMemo` nommé totals');
    return new Function('totalFacture', 'lignesDuPanier', 'cart', 'remiseDeLigne', 'remiseGlobale', 'tvaApplies', 'tvaCentimes', `return ${m[1]};`);
})();
/** Une ligne du panier comme `addItem` la pose, depuis l'article que l'inventaire a servi. */
const auPanier = (id, a, quantity = 1, disc = '') => ({
    item_id: id, name: a.name, quantity, unit_price: Number(a.unit_price || 0), tax_rate: Number(a.tax_rate || 0), disc, stock: a.quantity,
});

/**
 * CE QUE LA CAISSE ENVOIE pour un panier : son total, le règlement ventilé sur ce total (le dernier
 * moyen prend le solde), et le corps que `validate()` poste — mêmes champs, mêmes expressions
 * (tenues par le test « L'ÉCRAN » plus bas). `tvaCentimes` : ce que les réglages lui disent de la
 * facture qui va naître (migration 192) — vrai, comme la fausse base où toutes les migrations sont jouées.
 */
async function ceQueLaCaisseEnvoie({ cart, discount = '', tvaApplies = true, moyens = [{ method: 'CB', amount: '' }], tvaCentimes = true }) {
    const { totalFacture: totalEcran } = await ecran;
    const remiseDeLigne = cart.some((l) => tauxApplique(l.disc) > 0);
    const remiseGlobale = tauxApplique(discount);
    const totals = totauxDeLaPage(totalEcran, lignesDuPanier, cart, remiseDeLigne, remiseGlobale, tvaApplies, tvaCentimes);
    const reglement = resolvePayments(moyens, totals.ttc);
    return {
        totals, reglement,
        lignes: lignesDuPanier(cart, { remiseDeLigne, remiseGlobale, tvaApplies }),
        corps: {
            discount: remiseDeLigne ? 0 : remiseGlobale,
            payment_method: reglement.parts[0]?.method || null,
            payments: reglement.parts,
            status: 'PAYEE',
            lines: cart.map((l) => ({ item_id: l.item_id, quantity: l.quantity, discount_pct: tauxApplique(l.disc) })),
        },
    };
}

/* ── UN REFUS N'ÉCRIT RIEN ────────────────────────────────────────────────────────────────────── */

test('UNE RÉPARTITION FAUSSE — 150 € pour 120 € dus : refusée AVANT le numéro, le stock et la vente', async () => {
    /* Le numéro de l'émettrice est une ÉCRITURE (`next_number`), celui de la boutique aussi
       (shop_settings) : refuser après eux laissait un trou dans une séquence que la loi veut
       continue. Puis le stock descendait, et la vente s'écrivait, pointant vers une facture
       jamais créée. */
    for (const emetteur of [EMETTEUR, null]) {
        for (const payments of [[{ method: 'Espèces', amount: 150 }], [{ method: 'Espèces', amount: '30' }, { method: 'CB', amount: '70' }]]) {
            const r = await encaisser({ payments }, { emetteur });
            assert.strictEqual(r.code, 422, `${JSON.stringify(payments)} : ${dit(r)}`);
            rienEcrit(`${JSON.stringify(payments)}, ${emetteur ? 'avec' : 'sans'} émettrice`);
        }
    }
});

test('UN REFUS, QUEL QU\'IL SOIT, N\'ÉCRIT RIEN — toutes les vérifications passent avant le numéro', async () => {
    const cas = [
        ['panier vide', { lines: [] }, 422],
        ['remise globale illisible', { discount: 'douze' }, 422],
        ['règlement illisible', { payments: [{ method: 'Espèces', amount: 'cinquante' }, { method: 'CB', amount: '70' }] }, 422],
        ['stagiaire d\'un autre organisme', { learner_id: 'stag-ailleurs' }, 422],
        ['entreprise d\'un autre organisme', { company_id: 'ent-ailleurs' }, 422],
        ['article introuvable', { lines: [{ item_id: 'inconnu', quantity: 1 }] }, 404],
        ['stock insuffisant', { lines: [{ item_id: 'pelle', quantity: 11 }] }, 422],
        ['remise d\'article illisible', { lines: [{ item_id: 'pelle', quantity: 1, discount_pct: 'beaucoup' }] }, 422],
        ['deux remises cumulées', { discount: 5, lines: [{ item_id: 'pelle', quantity: 1, discount_pct: 10 }] }, 422],
        ['trop réglé', { payments: [{ method: 'CB', amount: '120,02' }] }, 422],
        ['trop peu réglé', { payments: [{ method: 'CB', amount: '119,98' }] }, 422],
    ];
    for (const [quoi, corps, code] of cas) {
        const r = await encaisser(corps, { emetteur: EMETTEUR });
        assert.strictEqual(r.code, code, `${quoi} : ${dit(r)}`);
        rienEcrit(quoi);
    }
});

test('LA MÊME VENTE, RÉGLÉE JUSTE — un numéro, une fois, puis le stock, la vente et la facture', async () => {
    const r = await encaisser({ payments: [{ method: 'Espèces', amount: '50,50' }, { method: 'CB', amount: '69,50' }] }, { emetteur: EMETTEUR });
    assert.strictEqual(r.code, 201, dit(r));
    const numero = `VT-${new Date().getFullYear()}-0012`;
    assert.strictEqual(r.corps.invoice_number, numero);
    assert.deepStrictEqual(ecrit(/^UPDATE billing_profile SET next_number/).map((e) => e.p), [[13, 'emet-1']], 'le numéro, pris une fois');
    assert.deepStrictEqual(ecrit(/^UPDATE shop_settings/), [], 'avec une émettrice, le compteur de la boutique ne bouge pas');
    assert.deepStrictEqual(ecrit(/^UPDATE inventory_item/).map((e) => e.p), [[1, 'pelle']]);
    const vente = colonnes(ecrit(/^INSERT INTO material_sale/)[0]);
    assert.strictEqual(vente.amount, '100.00');
    assert.strictEqual(vente.invoice_number, numero, 'la vente pointe vers SA facture…');
    const facture = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
    assert.strictEqual(facture.number, numero, '… qui existe');
    assert.strictEqual(facture.id, vente.invoice_id);
    assert.deepStrictEqual(JSON.parse(facture.payment_split), [{ method: 'Espèces', amount: 50.5 }, { method: 'CB', amount: 69.5 }]);
    assert.deepStrictEqual([r.corps.total_ht, r.corps.total_tva, r.corps.total_ttc], [100, 20, 120]);
    // L'ordre des écritures : le numéro d'abord, la facture ensuite — la vente la référence.
    assert.deepStrictEqual(b.ecritures.map((e) => e.q.split(' (')[0].split(' SET')[0]),
        ['UPDATE billing_profile', 'UPDATE inventory_item', 'INSERT INTO material_sale', 'INSERT INTO invoice', 'INSERT INTO invoice_line']);

    // Sans émettrice : le compteur de la boutique, une fois.
    const boutique = await encaisser({ payments: [{ method: 'CB', amount: '120' }] });
    assert.strictEqual(boutique.code, 201, dit(boutique));
    assert.deepStrictEqual(ecrit(/^UPDATE shop_settings SET next_number/).map((e) => e.p), [[8, ORG]]);
    assert.strictEqual(boutique.corps.invoice_number, `F-${new Date().getFullYear()}-0007`);
});

/* ── L'ÉCART TOLÉRÉ ET LE MESSAGE ─────────────────────────────────────────────────────────────── */

test('UN CENTIME DE TOLÉRANCE, À TOUS LES MONTANTS — compté en centimes entiers, pas en flottant', async () => {
    /* `Math.abs(somme - ttc) > 0.01` : 120,01 − 120 vaut 0,01000000000000512 — refusé —, quand
       60,01 − 60 vaut 0,00999999999999801 — accepté. Le même centime, deux verdicts. */
    for (const [id, total] of [['tablier', 60], ['pelle', 120]]) {
        for (const [ecart, code] of [[0, 201], [0.01, 201], [-0.01, 201], [0.02, 422], [-0.02, 422]]) {
            const regle = Number((total + ecart).toFixed(2));
            const r = await encaisser({ lines: [{ item_id: id, quantity: 1 }], payments: [{ method: 'CB', amount: regle }] });
            assert.strictEqual(r.code, code, `${regle} € réglés pour ${total} € dus : ${dit(r)}`);
            if (code === 422) rienEcrit(`${regle} € pour ${total} €`);
        }
    }
    // Le centime se compte sur la SOMME : trois parts dont l'addition flottante ne tombe pas rond.
    const trois = await encaisser({ payments: [{ method: 'Espèces', amount: '0,10' }, { method: 'Chèque', amount: '0,20' }, { method: 'CB', amount: '119,70' }] });
    assert.strictEqual(trois.code, 201, dit(trois));
});

test('LE MESSAGE ÉCRIT LES MONTANTS À LA FRANÇAISE — « 150,00 € », comme /factures et les demandes boutique', async () => {
    const r = await encaisser({ payments: [{ method: 'Espèces', amount: 150 }] });
    assert.strictEqual(dit(r), 'La répartition des paiements (150,00 €) ne correspond pas au total à régler (120,00 €).',
        'il imprimait « 150.00 € », avec un point');
    // Et le total annoncé est celui de la caisse : 1,055 € s'arrondit à 1,06 €, pas à 1,05 €.
    const demi = await encaisser({ lines: [{ item_id: 'brosse', quantity: 1 }], payments: [{ method: 'CB', amount: '1,10' }] });
    assert.strictEqual(dit(demi), 'La répartition des paiements (1,10 €) ne correspond pas au total à régler (1,06 €).');
});

test('RIEN À VÉRIFIER quand la vente reste impayée, ou sans règlement saisi — comme avant', async () => {
    const impayee = await encaisser({ status: 'IMPAYEE', payments: [{ method: 'CB', amount: 5 }] });
    assert.strictEqual(impayee.code, 201, dit(impayee));
    assert.strictEqual(colonnes(ecrit(/^INSERT INTO invoice \(/)[0]).status, 'IMPAYEE');
    const sansPart = await encaisser({ payments: [], payment_method: 'Virement' });
    assert.strictEqual(sansPart.code, 201, dit(sansPart));
    assert.strictEqual(colonnes(ecrit(/^INSERT INTO invoice \(/)[0]).payment_method, 'Virement');
});

/* ── CE QUE L'ÉCRAN CALCULE, LE SERVEUR L'ENCAISSE ────────────────────────────────────────────── */

test('UN ARTICLE À 1,00 € HT À 5,5 % — l\'écran règle 1,06 €, le serveur encaisse 1,06 €', async () => {
    for (const [prix, taux, attendu] of [['1.00', '5.50', 1.06], ['29.00', '5.50', 30.6], ['0.45', '10.00', 0.5], ['0.75', '10.00', 0.83]]) {
        const a = article('Article', prix, taux);
        const envoi = await ceQueLaCaisseEnvoie({ cart: [auPanier('art', a)] });
        assert.strictEqual(envoi.totals.ttc, attendu, `${prix} € à ${taux} % : le total de l'écran`);
        assert.deepStrictEqual(envoi.corps.payments, [{ method: 'CB', amount: attendu }]);

        const r = await encaisser(envoi.corps, { articles: { art: a } });
        assert.strictEqual(r.code, 201, `${prix} € à ${taux} % : ${dit(r)} — le serveur refusait ce que l'écran calculait`);
        assert.strictEqual(r.corps.total_ttc, attendu, 'le serveur annonce le total que l\'écran affichait');
        assert.strictEqual(ecrit(/^INSERT INTO invoice \(/).length, 1);
    }
    // Ventilé sur deux moyens, le solde est calculé sur ce même total.
    const envoi = await ceQueLaCaisseEnvoie({ cart: [auPanier('brosse', BROSSE)], moyens: [{ method: 'Espèces', amount: '0,50' }, { method: 'CB', amount: '' }] });
    assert.deepStrictEqual(envoi.corps.payments, [{ method: 'Espèces', amount: 0.5 }, { method: 'CB', amount: 0.56 }]);
    assert.strictEqual((await encaisser(envoi.corps)).code, 201);
});

test('L\'ÉCRAN ET LE SERVEUR, LE MÊME TOTAL AU CENTIME — un article seul, de 0,05 à 200 € HT, à 5,5 et 10 %', async () => {
    /* La plage du relevé, aux deux taux où la TVA d'un prix rond tombe sur un demi-centime : 16 prix
       y étaient refusés à 5,5 %, 296 à 10 %. Les autres taux passent par les paniers tirés au
       hasard, ci-dessous, et par la règle elle-même (les deux copies, et le PDF). */
    const refus = [];
    const ecarts = [];
    for (const taux of [5.5, 10]) {
        for (let c = 5; c <= 20000; c += 5) {
            const a = article('Article', (c / 100).toFixed(2), taux.toFixed(2));
            const envoi = await ceQueLaCaisseEnvoie({ cart: [auPanier('art', a)] });
            const r = await encaisser(envoi.corps, { articles: { art: a } });
            if (r.code !== 201) { refus.push(`${a.unit_price} € à ${taux} % : ${dit(r)}`); continue; }
            if (r.corps.total_ttc !== envoi.totals.ttc) ecarts.push(`${a.unit_price} € à ${taux} % : écran ${envoi.totals.ttc}, serveur ${r.corps.total_ttc}`);
        }
    }
    assert.deepStrictEqual(refus.slice(0, 5), [], `${refus.length} règlements calculés par l'écran refusés par le serveur`);
    assert.deepStrictEqual(ecarts.slice(0, 5), [], `${ecarts.length} totaux qui diffèrent entre l'écran et le serveur`);
});

test('… ET SUR DES PANIERS TIRÉS AU HASARD — lignes, quantités, remises, taux, TVA ou non, un à trois moyens', async () => {
    let graine = 20260930;
    const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
    const tirer = (liste) => liste[Math.floor(alea() * liste.length)];
    const desaccords = [];
    const horsFacture = [];
    let avantFaux = 0;
    for (let k = 0; k < 1500; k++) {
        const articles = {};
        const cart = Array.from({ length: 1 + Math.floor(alea() * 5) }, (_, i) => {
            const a = article(`Article ${i + 1}`, ((1 + Math.floor(alea() * 30000)) / 100).toFixed(2), tirer([0, 2.1, 5.5, 10, 20]).toFixed(2), 50);
            articles[`art-${i}`] = a;
            return auPanier(`art-${i}`, a, 1 + Math.floor(alea() * 3));
        });
        // Une remise sur un panier sur trois : sur des articles (texte tapé), ou sur toute la vente.
        const mode = tirer(['aucune', 'aucune', 'ligne', 'globale']);
        if (mode === 'ligne') for (const l of cart) if (alea() < 0.5) l.disc = tirer(['10', '12,5', '7', '33,3']);
        const discount = mode === 'globale' ? tirer(['5', '12,5', '15']) : '';
        const tvaApplies = alea() < 0.85;
        const moyens = tirer([
            [{ method: 'CB', amount: '' }],
            [{ method: 'Espèces', amount: '10' }, { method: 'CB', amount: '' }],
            [{ method: 'Espèces', amount: '5,5' }, { method: 'Chèque', amount: '2,25', bank: 'BNP', cheque_number: '42' }, { method: 'CB', amount: '' }],
        ]);
        // Un panier sur deux avant la migration 192, un sur deux après : l'écran suit ce que disent ses réglages.
        const tvaCentimes = k % 2 === 0;
        const envoi = await ceQueLaCaisseEnvoie({ cart, discount, tvaApplies, moyens, tvaCentimes });
        if (!envoi.reglement.valid) continue; // un panier plus petit que la part en espèces : l'écran bloque, rien ne part
        const r = await encaisser(envoi.corps, { articles, reglages: { ...REGLAGES, tva_applies: tvaApplies ? 1 : 0 }, sans: tvaCentimes ? [] : ['tva_centimes'] });
        const ecritsHt = r.code === 201 ? ecrit(/^INSERT INTO invoice_line/).map(colonnes).map((l) => l.amount_net) : [];
        const sommeReglee = envoi.corps.payments.reduce((s, p) => s + centimes(p.amount), 0);
        const quoi = JSON.stringify({ cart: cart.map((l) => [l.unit_price, l.tax_rate, l.quantity, l.disc]), discount, tvaApplies });
        if (r.code !== 201 || r.corps.total_ttc !== envoi.totals.ttc || r.corps.total_ht !== envoi.totals.ht
            || r.corps.total_tva !== envoi.totals.tva || sommeReglee !== centimes(envoi.totals.ttc)
            || JSON.stringify(ecritsHt) !== JSON.stringify(envoi.lignes.map((l) => l.ht))) {
            desaccords.push(`${quoi} → ${r.code} ${dit(r)}`);
            continue;
        }
        /* ET CE TOTAL EST CELUI DE LA FACTURE, plusieurs taux compris : le PDF, relu dans ce qui a été
           écrit, imprime ce que la caisse a encaissé. */
        const pdf = totalDuPdf();
        if (pdf !== envoi.totals.ttc) horsFacture.push(`${quoi} : encaissé ${envoi.totals.ttc} €, facturé ${pdf} €`);
        if (totalArrondiUneFois(envoi.lignes) !== pdf) avantFaux++;
    }
    assert.deepStrictEqual(desaccords.slice(0, 3), [], `${desaccords.length} paniers où l'écran et le serveur ne s'entendent pas`);
    assert.deepStrictEqual(horsFacture.slice(0, 3), [], `${horsFacture.length} ventes encaissées à un autre montant que leur facture`);
    assert.ok(avantFaux >= 50, `le tirage doit éprouver l'arrondi par taux : ${avantFaux} ventes tombaient à côté de leur facture avec la règle d'avant`);
});

/* ── LA RÈGLE, DES DEUX CÔTÉS ─────────────────────────────────────────────────────────────────── */

test('LES DEUX COPIES DE LA RÈGLE (`totalFacture`, lib/ttc.js) rendent la même chose — et HT + TVA = TTC, au centime', async () => {
    const { totalFacture: totalEcran } = await ecran;
    // Les cas qui départagent : le demi-centime s'arrondit vers le haut, comme sur la facture.
    const reperes = [
        [[{ ht: 1, taux: 5.5 }], { ht: 1, tva: 0.06, ttc: 1.06 }],
        [[{ ht: 0.45, taux: 10 }], { ht: 0.45, tva: 0.05, ttc: 0.5 }],
        [[{ ht: 29, taux: 5.5 }], { ht: 29, tva: 1.6, ttc: 30.6 }],
        [[{ ht: 100, taux: 20 }, { ht: 50, taux: 0 }], { ht: 150, tva: 20, ttc: 170 }],
        [[{ ht: 99.99, taux: 20 }], { ht: 99.99, tva: 20, ttc: 119.99 }],
        [[], { ht: 0, tva: 0, ttc: 0 }],
        /* Deux taux : la TVA s'arrondit PAR TAUX, comme sur la facture (6,67 + 0,43 = 7,10 €). La règle
           d'avant l'arrondissait une fois sur le tout (7,0935 → 7,09 €) : 48,19 € encaissés pour
           48,20 € facturés. Tranché le 2026-09-30 (CLAUDE.md § 3). */
        [[{ ht: 33.33, taux: 20 }, { ht: 7.77, taux: 5.5 }], { ht: 41.1, tva: 7.1, ttc: 48.2 }],
    ];
    // Une ligne par taux : les deux calculs de la facture (avant et depuis la migration 192) s'accordent.
    for (const [lignes, attendu] of reperes) {
        for (const tvaCentimes of [false, true]) {
            assert.deepStrictEqual(totalFacture(lignes, false, tvaCentimes), attendu, `serveur : ${JSON.stringify(lignes)}`);
            assert.deepStrictEqual(totalEcran(lignes, false, tvaCentimes), attendu, `écran : ${JSON.stringify(lignes)}`);
        }
    }
    let graine = 7;
    const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
    for (let k = 0; k < 50000; k++) {
        const lignes = Array.from({ length: 1 + Math.floor(alea() * 6) }, () => ({
            ht: Math.floor(alea() * 500000) / 100, taux: [0, 1.05, 2.1, 5.5, 8.5, 10, 13, 20][Math.floor(alea() * 8)],
        }));
        for (const tvaCentimes of [false, true]) {
            const s = totalFacture(lignes, false, tvaCentimes);
            assert.deepStrictEqual(totalEcran(lignes, false, tvaCentimes), s, JSON.stringify(lignes));
            assert.strictEqual(centimes(s.ht) + centimes(s.tva), centimes(s.ttc), `HT + TVA ≠ TTC : ${JSON.stringify(lignes)}`);
            for (const v of [s.ht, s.tva, s.ttc]) assert.strictEqual(Number(v.toFixed(2)), v, `${v} n'est pas un montant au centime`);
        }
    }
});

test('UN ARTICLE SEUL S\'ENCAISSE AU TOTAL DU PDF — l\'arrondi de `ventilerTva`, à chaque centime jusqu\'à 2 000 €', async () => {
    /* C'est ce qui départage les deux anciens arrondis : 1,055 € fait 1,06 € sur la facture. Le
       serveur disait 1,05 € (`toFixed`), et l'écran 1,06 € par la grâce du flottant — sauf sur
       d'autres montants, où `Math.round(x * 100)` passait sous le demi. C'est la copie de l'ÉCRAN
       qu'on éprouve : le serveur, lui, appelle `ventilerTva`. */
    const { totalFacture: totalEcran } = await ecran;
    const ecarts = [];
    for (const taux of [0, 2.1, 5.5, 10, 20]) {
        for (let c = 0; c <= 200000; c++) {
            const ht = c / 100;
            const pdf = ventilerTva({ amountNet: ht, tvaExoneree: false, taxRate: null, lines: [{ amount: ht, taxRate: taux }] }).grand;
            if (totalEcran([{ ht, taux }]).ttc !== pdf) ecarts.push(`${ht} € à ${taux} % : caisse ${totalEcran([{ ht, taux }]).ttc}, PDF ${pdf}`);
        }
    }
    assert.deepStrictEqual(ecarts.slice(0, 5), [], `${ecarts.length} articles encaissés à un autre montant que leur facture`);
});

test('PLUSIEURS LIGNES D\'UN MÊME TAUX — depuis la 192, les réglages, l\'écran, le serveur et la facture comptent en centimes entiers', async () => {
    /* 122,60 + 159,45 + 5,88 + 141,42 € HT à 10 % : 42,935 € de TVA. Le PDF additionnait les HT en
       flottant (429,34999…) et imprimait 472,28 € — et la caisse, qui recopie son calcul, encaissait
       autant. Une facture née avec `tva_centimes` imprime 472,29 € ; les réglages le disent à l'écran,
       qui annonce et fait régler ce montant-là. Sans la migration, rien ne change : 472,28 € partout. */
    const articles = {
        pelle: article('Pelle', '122.60', '10.00'), brosse: article('Brosse', '159.45', '10.00'),
        farine: article('Farine', '5.88', '10.00'), four: article('Four', '141.42', '10.00'),
    };
    const cart = Object.entries(articles).map(([id, a]) => auPanier(id, a));
    for (const [joue, attendu] of [[true, 472.29], [false, 472.28]]) {
        const quand = joue ? 'la 192 jouée' : 'la 192 non jouée';
        const sans = joue ? [] : ['tva_centimes'];
        base({ sans });
        const reglages = { code: 200, corps: null };
        await getShopSettings({ user: { organization_id: ORG } },
            { status(c) { reglages.code = c; return this; }, json(x) { reglages.corps = x; return this; } });
        assert.strictEqual(reglages.corps.data.tva_centimes, joue, `${quand} : ce que les réglages disent à l'écran`);

        const envoi = await ceQueLaCaisseEnvoie({ cart, tvaCentimes: reglages.corps.data.tva_centimes });
        assert.strictEqual(envoi.totals.ttc, attendu, `${quand} : le total de l'écran`);
        assert.deepStrictEqual(envoi.corps.payments, [{ method: 'CB', amount: attendu }]);
        const r = await encaisser(envoi.corps, { articles, sans });
        assert.strictEqual(r.code, 201, dit(r));
        assert.strictEqual(r.corps.total_ttc, attendu, `${quand} : le total vérifié par le serveur`);
        assert.strictEqual(colonnes(ecrit(/^INSERT INTO invoice \(/)[0]).tva_centimes, joue ? 1 : undefined,
            `${quand} : la facture naît avec son drapeau, ou sans la colonne`);
        assert.strictEqual(totalDuPdf(), attendu, `${quand} : le PDF, relu dans ce qui a été écrit, imprime le total encaissé`);
    }
});

/* ── L'ÉCRAN ──────────────────────────────────────────────────────────────────────────────────── */

test('L\'ÉCRAN — le total, le TTC d\'une ligne et le règlement passent par la règle commune', async () => {
    const page = sansCommentaires('pages/Ventes.jsx');
    assert.match(page, /import \{ totalFacture \} from "\.\.\/lib\/ttc\.js";/);
    assert.match(page, /\.\.\.totalFacture\(lignesDuPanier\(cart, \{ remiseDeLigne, remiseGlobale, tvaApplies \}\), !tvaApplies, tvaCentimes\),/, 'le total du panier');
    assert.match(page, /\{euro\(totalFacture\(lignesDuPanier\(\[l\], \{ remiseDeLigne, remiseGlobale, tvaApplies \}\), !tvaApplies, tvaCentimes\)\.ttc\)\}/,
        'le TTC d\'une ligne, par la même règle : un article seul affiche ce que le total annonce');
    // Le calcul de la facture qui va naître : ce que disent les réglages (migration 192).
    assert.match(page, /const tvaCentimes = !!\(settings && settings\.tva_centimes\);/);
    assert.doesNotMatch(page, /ttc: ht \+ tva|tva \+= lineHT/, 'plus aucun total additionné en flottant, arrondi ailleurs');
    // Le règlement se ventile sur CE total, à l'écran comme à l'envoi.
    assert.match(page, /<PaiementSplit options=\{payOptions\} total=\{totals\.ttc\} rows=\{payments\} onChange=\{setPayments\} \/>/);
    assert.match(page, /const \{ parts \} = resolvePayments\(payments, totals\.ttc\);/);
    // Ce que `ceQueLaCaisseEnvoie` reproduit, plus haut : le panier tel qu'`addItem` le pose, et le corps de `validate()`.
    assert.match(page, /unit_price: Number\(it\.unit_price \|\| 0\), tax_rate: Number\(it\.tax_rate \|\| 0\), disc: "", stock/);
    assert.match(page, /discount: remiseDeLigne \? 0 : remiseGlobale,/);
    assert.match(page, /payments: parts,\s+status: paid \? "PAYEE" : "IMPAYEE",/);
    assert.match(page, /lines: cart\.map\(\(l\) => \(\{ item_id: l\.item_id, quantity: l\.quantity, discount_pct: tauxApplique\(l\.disc\) \}\)\),/);
    assert.match(page, /const remiseDeLigne = useMemo\(\(\) => cart\.some\(\(l\) => tauxApplique\(l\.disc\) > 0\), \[cart\]\);/);

    // Un article seul : sa ligne et le total disent le même montant, celui que le serveur encaissera.
    const { euro } = await format;
    const { totalFacture: totalEcran } = await ecran;
    const cart = [auPanier('brosse', BROSSE)];
    const options = { remiseDeLigne: false, remiseGlobale: 0, tvaApplies: true };
    const ligne = euro(totalEcran(lignesDuPanier(cart, options), false).ttc);
    const { totals } = await ceQueLaCaisseEnvoie({ cart });
    assert.strictEqual(ligne, '1,06 €');
    assert.strictEqual(euro(totals.ttc), ligne);
    assert.strictEqual(euro(totals.ht), '1 €');
    assert.strictEqual(euro(totals.tva), '0,06 €', 'HT + TVA tombent sur le TTC affiché');
});
