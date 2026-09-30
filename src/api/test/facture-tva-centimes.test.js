/**
 * LA TVA D'UNE NOUVELLE FACTURE EN CENTIMES ENTIERS, ET UNE FACTURE ÉMISE QUI GARDE SON CALCUL —
 * relevé et décidé le 2026-09-30.
 *
 * LE DÉFAUT, relevé en corrigeant la caisse. `ventilerTva` (lib/facturx.js), qui fait la TVA et le
 * TTC du PDF et du XML Factur-X, additionnait les HT d'un taux EN FLOTTANT avant d'arrondir. Quand la
 * TVA exacte tombe sur un demi-centime, la somme passe parfois juste en dessous, et l'arrondi part
 * vers le bas : 122,60 + 159,45 + 5,88 + 141,42 = 429,35 € HT à 10 %, TVA exacte 42,935 €, imprimaient
 * 42,93 € et 472,28 € au lieu de 42,94 € et 472,29 €. Toujours un centime DE MOINS (0,26 % de paniers
 * tirés au hasard, de 2 à 5 lignes d'un même taux). Et les écrans qui annoncent la facture en
 * recopient le calcul (lib/ttc.js) : la caisse et la boutique encaissaient ce centime de moins.
 *
 * LA DÉCISION, prise avec l'école le même jour. Rien n'est figé à l'émission : la base ne garde que des
 * HT, et le PDF comme le XML se recalculent à chaque téléchargement. Corriger toutes les factures
 * aurait changé le total réimprimé de pièces déjà remises au client. SEULES LES NOUVELLES comptent donc
 * en centimes entiers : celles qui naissent avec `invoice.tva_centimes = 1` (migration 192), écrit par
 * le code qui les crée.
 *
 * Ce fichier gèle :
 *   · le cas relevé, au centime, pour une facture créée depuis la 192 ;
 *   · une facture d'avant, qui garde l'ancien calcul À L'IDENTIQUE — son centime de moins compris ;
 *   · la portée : les deux calculs ne diffèrent jamais sur une ligne seule, ni à 20 % (donc jamais sur
 *     un document de /factures), et jamais que d'un centime, vers le haut ;
 *   · la TVA d'un taux est l'arrondi exact de sa base, calculé à part, sur des paniers à un ou
 *     plusieurs taux ;
 *   · le drapeau, de la ligne `invoice` jusqu'au XML Factur-X, par le vrai `loadInvoiceData` ;
 *   · tout code qui crée une facture l'écrit ; la migration ne le donne jamais par défaut.
 * Les trois points de création sont éprouvés sur leur vrai contrôleur, chacun dans son fichier :
 * caisse-reglement, boutique-reglement et factures-modele-reglement (qui tient aussi l'écran, `ttcDe`).
 * Les écrans qui annoncent la facture — caisse, panier, « Mes demandes », carte et fenêtre d'une
 * demande — suivent son calcul : total-facture-ecrans.test.js.
 *
 * Chaque test a été vu ROUGE en réintroduisant le défaut qu'il gèle.
 *
 * HORS SUJET, non gelé ici : sur un panier à PLUSIEURS taux, la caisse arrondit la TVA une fois et la
 * facture par taux ; l'écart d'un centime qui en résulte est connu, et laissé tel quel (CLAUDE.md § 3).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
/** Le code seul : les commentaires RACONTENT l'ancien calcul, ils ne doivent pas compter. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

/* ── Une fausse base : ce que `loadInvoiceData` lit pour une facture ─────────────────────────────── */
const ORG = 'org-1';
let b;
const faux = {
    promise: () => ({
        query: async (sql) => {
            const q = plat(sql);
            if (/FROM invoice i LEFT JOIN enrollment e/.test(q) && /WHERE i\.id = \? AND i\.organization_id = \?/.test(q)) return [[{ ...b.facture }]];
            if (/^SELECT \* FROM organization WHERE id = \?/.test(q)) {
                return [[{ id: ORG, legal_name: 'École Pizza', siret: '12345678900012', email: 'ecole@example.fr', town: 'LANNEMEZAN' }]];
            }
            if (/FROM invoice_line il /.test(q)) return [b.lignes.map((l) => ({ ...l }))];
            return [[]];
        },
    }),
    query: (sql, p, cb) => { const f = typeof p === 'function' ? p : cb; if (typeof f === 'function') f(null, []); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { ventilerTva } = require('../lib/facturx.js');
const { getInvoiceXml, invoiceCtx } = require('../controllers/invoice.controller.js');

/** Le cas relevé : quatre lignes à 10 %, 429,35 € HT. */
const QUATRE = [122.60, 159.45, 5.88, 141.42];
const facture = (montants, taux, o = {}) => ({
    amountNet: montants.reduce((s, x) => s + x, 0), tvaExoneree: false, taxRate: null,
    lines: montants.map((amount) => ({ amount, taxRate: taux })), ...o,
});
const totaux = (v) => [v.base, v.taxe, v.grand];

/* Math.imul : le produit reste exact sur 32 bits. Écrit en flottant, il dépasse 2^53 et perd ses
   bits bas — le tirage resterait déterministe, mais bien moins varié qu'il n'en a l'air. */
let graine = 20260930;
const alea = () => { graine = (Math.imul(graine, 1103515245) + 12345) >>> 0; return graine / 4294967296; };
const tirer = (liste) => liste[Math.floor(alea() * liste.length)];
/** Un panier de 2 à 5 lignes, au centime, jusqu'à 2 000 € la ligne. */
const panier = () => Array.from({ length: 2 + Math.floor(alea() * 4) }, () => Math.floor(alea() * 200001) / 100);

/* ── LE CAS RELEVÉ ────────────────────────────────────────────────────────────────────────────── */

test('LE CAS RELEVÉ — 429,35 € HT à 10 % en quatre lignes : 42,94 € de TVA et 472,29 € TTC sur une facture créée depuis la 192', () => {
    // La somme flottante : c'est elle qui faisait arrondir 42,935 € vers le bas.
    assert.notStrictEqual(QUATRE.reduce((s, x) => s + x, 0), 429.35, 'la somme flottante des quatre HT passe sous 429,35');
    const v = ventilerTva(facture(QUATRE, 10, { tvaCentimes: true }));
    assert.deepStrictEqual(totaux(v), [429.35, 42.94, 472.29], 'la TVA exacte, 42,935 €, s\'arrondit au centime supérieur');
    assert.deepStrictEqual(v.groupes, [{ cat: 'S', taux: 10, base: 429.35, taxe: 42.94 }]);
    // Telle que `loadInvoiceData` la relit : les montants et le taux en texte, comme mysql2 rend un DECIMAL.
    const lue = ventilerTva({
        amountNet: '429.35', tvaExoneree: false, taxRate: '10.00', tvaCentimes: true,
        lines: ['122.60', '159.45', '5.88', '141.42'].map((a) => ({ amount: Number(a), taxRate: '10.00' })),
    });
    assert.deepStrictEqual(totaux(lue), [429.35, 42.94, 472.29]);
    // Et le PDF l'imprime : totaux du modèle, et le moyen unique réglé pour le TTC entier.
    const ctx = invoiceCtx({ legal_name: 'École Pizza' }, {
        ...facture(QUATRE, 10, { tvaCentimes: true }), number: 'F-2026-0042', typeLabel: 'Facture', issueDate: '20260930',
        buyer: { name: 'Client comptoir', address: {} }, paymentMethod: 'CB', paymentSplit: null,
    });
    assert.deepStrictEqual([ctx.invoice.totalHt, ctx.invoice.totalTva, ctx.invoice.totalTtc], ['429,35 €', '42,94 €', '472,29 €']);
    assert.deepStrictEqual(ctx.payments, [{ method: 'CB', amount: 472.29 }]);
});

/* ── UNE FACTURE ÉMISE GARDE SON CALCUL ───────────────────────────────────────────────────────── */

/**
 * L'ANCIEN CALCUL, recopié tel qu'il était le 2026-09-30 : la SPÉCIFICATION de ce qui a été imprimé sur
 * les factures émises. D'ordinaire un test qui approuve une copie n'approuve rien (finance.test.js) ;
 * ici, c'est exactement ce qu'on veut geler : que le code ne s'en écarte plus jamais, d'un centime,
 * pour une facture qui ne porte pas le drapeau.
 */
function ancienCalcul(d) {
    const net = Number(d.amountNet);
    if (d.tvaExoneree) {
        return { groupes: [{ cat: 'E', taux: 0, base: net, taxe: 0 }], base: net, taxe: 0, grand: net };
    }
    const tauxDefaut = Number.isFinite(Number(d.taxRate)) && d.taxRate !== null ? Number(d.taxRate) : 20;
    const lignes = (d.lines && d.lines.length) ? d.lines : [{ name: d.lineName, amount: net }];
    const parTaux = new Map();
    for (const ln of lignes) {
        const t = Number.isFinite(Number(ln.taxRate)) && ln.taxRate !== null && ln.taxRate !== undefined
            ? Number(ln.taxRate) : tauxDefaut;
        parTaux.set(t, (parTaux.get(t) || 0) + Number(ln.amount || 0));
    }
    const groupes = [...parTaux.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([taux, base]) => ({ cat: taux === 0 ? 'Z' : 'S', taux, base: Math.round(base * 100) / 100, taxe: Math.round(base * taux) / 100 }));
    const base = Math.round(groupes.reduce((s, g) => s + g.base, 0) * 100) / 100;
    const taxe = Math.round(groupes.reduce((s, g) => s + g.taxe, 0) * 100) / 100;
    return { groupes, base, taxe, grand: Math.round((base + taxe) * 100) / 100 };
}

test('UNE FACTURE ÉMISE AVANT LA 192 GARDE SON CALCUL — son centime de moins compris : c\'est ce que le client a reçu', () => {
    // Sans drapeau : colonne absente (migration non jouée), ou 0 (facture existante, ou écrite par un ancien code).
    for (const tvaCentimes of [undefined, false, 0, null]) {
        assert.deepStrictEqual(totaux(ventilerTva(facture(QUATRE, 10, { tvaCentimes }))), [429.35, 42.93, 472.28],
            `drapeau ${tvaCentimes} : la facture émise imprimait 472,28 €, elle l'imprime encore`);
    }
    // Et sur tout ce que la base peut porter, à l'identique : taux de ligne, d'en-tête, ou aucun (20 %,
    // avant la 108), en nombre ou en texte, plusieurs taux, facture sans ligne détaillée, exonérée.
    for (let k = 0; k < 20000; k++) {
        const tauxEntete = tirer([null, null, 20, '5.50', 10]);
        const d = {
            amountNet: (Math.floor(alea() * 500001) / 100).toFixed(2), tvaExoneree: alea() < 0.1, taxRate: tauxEntete, lineName: 'Formation',
            lines: alea() < 0.1 ? [] : Array.from({ length: 1 + Math.floor(alea() * 5) }, () => ({
                amount: tirer([Math.floor(alea() * 200001) / 100, (Math.floor(alea() * 200001) / 100).toFixed(2)]),
                taxRate: tirer([undefined, null, 0, 2.1, '5.50', 10, '10.00', 20, '20.00']),
            })),
        };
        assert.deepStrictEqual(ventilerTva(d), ancienCalcul(d), JSON.stringify(d));
    }
});

/* ── LA PORTÉE DE LA CORRECTION ───────────────────────────────────────────────────────────────── */

test('LA PORTÉE — jamais sur une ligne seule, jamais à 20 %, et jamais que d\'un centime vers le haut', () => {
    const ecart = (montants, taux) => Math.round(ventilerTva(facture(montants, taux, { tvaCentimes: true })).grand * 100)
        - Math.round(ventilerTva(facture(montants, taux)).grand * 100);
    // Une ligne seule, à chaque centime jusqu'à 2 000 € : les deux calculs s'accordent.
    const seules = [];
    for (const taux of [2.1, 5.5, 10, 20]) {
        for (let c = 0; c <= 200000; c++) if (ecart([c / 100], taux) !== 0) seules.push(`${c / 100} € à ${taux} %`);
    }
    assert.deepStrictEqual(seules.slice(0, 5), [], `${seules.length} lignes seules changeraient de total`);
    // À 20 % sur plusieurs lignes : jamais — le cinquième d'un nombre entier de centimes ne tombe jamais sur un demi.
    // Les documents de /factures (20 % ou exonérés) ne changent donc pas, ni l'écran qui les prépare.
    const parTaux = { 2.1: 0, 5.5: 0, 10: 0, 20: 0 };
    for (let k = 0; k < 100000; k++) {
        const taux = tirer([2.1, 5.5, 10, 20]);
        const e = ecart(panier(), taux);
        assert.ok(e === 0 || e === 1, `écart de ${e} centime(s) : seul le centime arrondi vers le bas se corrige`);
        parTaux[taux] += e;
    }
    assert.strictEqual(parTaux[20], 0, 'à 20 %, aucun panier ne change');
    assert.ok(parTaux[10] > 0, `à 10 %, le défaut est courant : ${JSON.stringify(parTaux)}`);
    // Aux deux autres taux, il demande un total rond (5,5 % : un nombre impair d'euros ; 2,1 % : 5 € près
    // d'une dizaine) — rare au hasard, mais réel : un panier relevé par taux.
    for (const [montants, taux] of [[QUATRE, 10], [[190.03, 115.13, 35.02, 136.15, 16.67], 5.5], [[132.73, 18.56, 120.13, 131.41, 12.17], 2.1]]) {
        assert.strictEqual(ecart(montants, taux), 1, `${montants.join(' + ')} à ${taux} %`);
    }
});

/* ── L'ARRONDI EXACT ──────────────────────────────────────────────────────────────────────────── */

test('LA TVA D\'UN TAUX EST L\'ARRONDI EXACT DE SA BASE — le demi-centime vers le haut, sur tout panier, depuis la 192', () => {
    /* La référence est calculée À PART : les montants tels qu'ils s'écrivent (« 122.60 »), lus en
       entiers sans passer par un flottant, la TVA exacte de chaque taux en BigInt, arrondie une fois. */
    const enEntier = (texte, decimales) => {
        const [e, d = ''] = texte.split('.');
        return BigInt(e + d.padEnd(decimales, '0').slice(0, decimales));
    };
    let avant = 0;
    for (let k = 0; k < 50000; k++) {
        const lignes = Array.from({ length: 1 + Math.floor(alea() * 6) }, () => ({
            ht: (Math.floor(alea() * 500001) / 100).toFixed(2),
            taux: tirer(['0', '1.05', '2.1', '5.5', '8.5', '10', '13', '20']),
        }));
        const bases = new Map(); // taux → base en centimes
        for (const l of lignes) bases.set(l.taux, (bases.get(l.taux) || 0n) + enEntier(l.ht, 2));
        let base = 0n, tva = 0n;
        for (const [taux, centimes] of bases) {
            base += centimes;
            tva += (centimes * enEntier(taux, 3) + 50000n) / 100000n;
        }
        const d = { amountNet: 0, tvaExoneree: false, taxRate: null, lines: lignes.map((l) => ({ amount: Number(l.ht), taxRate: Number(l.taux) })) };
        const exact = [Number(base) / 100, Number(tva) / 100, Number(base + tva) / 100];
        assert.deepStrictEqual(totaux(ventilerTva({ ...d, tvaCentimes: true })), exact, JSON.stringify(lignes));
        if (ventilerTva(d).grand !== exact[2]) avant++;
    }
    // Sans le drapeau, la facture s'en écartait parfois : l'écart que la 192 ferme, pour les nouvelles seulement.
    assert.ok(avant > 0, 'l\'ancien calcul imprimait parfois un centime de moins que l\'arrondi exact');
});

/* ── LE DRAPEAU, DE LA FACTURE AU XML ─────────────────────────────────────────────────────────── */

/** Une ligne de facture telle que la base la rend : les décimaux en texte. */
const ligne = (description, ht) => ({
    description, amount_net: ht, tax_rate: '10.00', qty: 1, unit_price_ht: ht, reference: null,
    discount_pct: '0.00', unit_price_gross_ht: ht, program_title: null, first_name: null, last_name: null,
});
const FACTURE = {
    id: 'inv-42', organization_id: ORG, number: 'F-2026-0042', type: 'FACTURE', amount_net: '429.35', tva_exoneree: 0,
    tax_rate: null, issue_ymd: '20260930', due_ymd: null, program_title: null, enrollment_id: null, company_id: null,
    learner_id: null, buyer_name: 'Client comptoir', buyer_email: 'client@example.fr', billing_profile_id: null,
    payment_method: 'CB', payment_split: null, template_slug: null, status: 'PAYEE',
};

/** GET /api/factures/:id/xml, sur la facture donnée : les totaux du XML Factur-X. */
async function totauxDuXml(ligneFacture) {
    b = { facture: ligneFacture, lignes: [ligne('Pelle', '122.60'), ligne('Brosse', '159.45'), ligne('Farine', '5.88'), ligne('Four', '141.42')] };
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; }, set() { return this; }, send(x) { r.corps = x; return this; } };
    const [avertir, erreur] = [console.warn, console.error];
    console.warn = () => {}; console.error = () => {};
    try { await getInvoiceXml({ user: { organization_id: ORG }, params: { id: 'inv-42' } }, res); }
    finally { console.warn = avertir; console.error = erreur; }
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    const lu = (balise) => (new RegExp(`<ram:${balise}[^>]*>([^<]*)</ram:${balise}>`).exec(r.corps) || [])[1];
    return ['TaxBasisTotalAmount', 'TaxTotalAmount', 'GrandTotalAmount', 'DuePayableAmount', 'CalculatedAmount'].map(lu);
}

test('LE DRAPEAU VA DE LA FACTURE AU XML FACTUR-X — relu dans invoice.tva_centimes par `loadInvoiceData`', async () => {
    assert.deepStrictEqual(await totauxDuXml({ ...FACTURE, tva_centimes: 1 }), ['429.35', '42.94', '472.29', '472.29', '42.94'],
        'une facture créée depuis la 192');
    assert.deepStrictEqual(await totauxDuXml({ ...FACTURE, tva_centimes: 0 }), ['429.35', '42.93', '472.28', '472.28', '42.93'],
        'une facture d\'avant la 192 : son XML ne change pas');
    assert.deepStrictEqual(await totauxDuXml({ ...FACTURE }), ['429.35', '42.93', '472.28', '472.28', '42.93'],
        'la 192 non jouée : rien ne change');
});

/* ── LE DRAPEAU NAÎT AVEC LA FACTURE ──────────────────────────────────────────────────────────── */

test('TOUT CODE QUI CRÉE UNE FACTURE ÉCRIT LE DRAPEAU — une facture qui naîtrait sans lui garderait l\'ancien calcul', () => {
    const createurs = [];
    for (const dossier of ['src/api/controllers', 'src/api/lib']) {
        for (const f of fs.readdirSync(path.join(RACINE, dossier)).filter((x) => x.endsWith('.js'))) {
            const src = code(lire(`${dossier}/${f}`));
            if (!/INSERT INTO invoice \(/.test(src)) continue;
            createurs.push(f);
            assert.match(src, /'invoice', 'tva_centimes'\)|colonneFacture\(conn, 'tva_centimes'\)/, `${f} : la colonne doit être sondée — sans la 192, l'écrire ferait échouer la facture`);
            assert.match(src, /tva_centimes'?\); iVal\.push\(1\)|ic\.push\('tva_centimes'\); iv\.push\(1\)|colonne: ', tva_centimes', place: ', \?', valeurs: \[1\]/,
                `${f} : la facture doit naître avec tva_centimes = 1`);
        }
    }
    // La recherche a bien trouvé les trois : sans eux, ce test ne prouverait rien.
    assert.deepStrictEqual(createurs.sort(), ['invoice.controller.js', 'sale.controller.js', 'shopRequest.controller.js']);
});

test('LA MIGRATION 192 NE DONNE JAMAIS LE DRAPEAU PAR DÉFAUT — aucune facture existante ne change de calcul', () => {
    const mig = lire('database/migrations/192_facture_tva_centimes.sql');
    const rev = lire('database/migrations/192_revert_facture_tva_centimes.sql');
    for (const [nom, sql] of [['192', mig], ['192_revert', rev]]) {
        assert.doesNotMatch(sql, /^\s*--/m, `${nom} : commentaires en blocs /* */`);
    }
    assert.match(code(mig), /ALTER TABLE invoice\s+ADD COLUMN IF NOT EXISTS tva_centimes tinyint\(1\) NOT NULL DEFAULT 0\b/);
    /* À 1 par défaut, une facture créée par l'ANCIEN code après la migration — imprimée à l'ancienne —
       se réimprimerait autrement une fois le nouveau code déployé : c'est le code qui crée la facture
       qui écrit le 1, pour que l'ordre du déploiement et de la migration ne compte pas. */
    assert.doesNotMatch(code(mig), /DEFAULT 1|SET DEFAULT|UPDATE invoice/, 'ni 1 par défaut, ni facture existante réécrite');
    assert.match(code(rev), /ALTER TABLE invoice\s+DROP COLUMN IF EXISTS tva_centimes;/);
});
