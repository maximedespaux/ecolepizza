/**
 * LE TOTAL ANNONCÉ EST CELUI DE LA FACTURE — panier du stagiaire, « Mes demandes », carte d'une
 * demande, fenêtre « Facturer la demande », caisse. Tranché le 2026-09-30.
 *
 * LE DÉFAUT. La facture ventile sa TVA PAR TAUX (`ventilerTva`), comme Factur-X l'exige. Les écrans
 * qui annoncent un montant à payer additionnaient, eux, les TTC de ligne et arrondissaient à la fin.
 * Sur près d'un panier à deux taux sur quatre — et de loin en loin sur un seul, quand la TVA tombe sur
 * un demi-centime —, le montant ANNONCÉ, donc ENCAISSÉ, était à un centime du total FACTURÉ : 33,33 €
 * HT à 20 % et 7,77 € HT à 5,5 %, 48,19 € encaissés, 48,20 € sur la facture, qui imprimait « Moyens et
 * montants réglés : 48,19 € » sous son total. La caisse, elle, arrondissait la TVA une fois sur le
 * tout (lib/totalCaisse.js, retirée) : le même centime, sur les mêmes paniers.
 *
 * Ce fichier gèle :
 *   · la copie de l'écran (src/app/ui/lib/ttc.js) : le total de `ventilerTva` au centime, sur des
 *     milliers de paniers à plusieurs taux, exonération comprise — et le module du serveur
 *     (src/api/lib/ttc.js), qui appelle `ventilerTva` ;
 *   · une ligne : le TTC que la facture imprime dans sa colonne « Total TTC » ;
 *   · une demande boutique : la facture de l'école au centime, le partenaire ventilé à part, le
 *     « sur demande » signalé ;
 *   · le panier (`cartTotals`) et la carte (`listShopRequests`) : le total de la facture ;
 *   · chaque écran appelle la fonction partagée : plus une somme de TTC de ligne nulle part.
 *
 * La caisse — le calcul de Ventes.jsx ET `checkout`, confrontés au PDF relu dans ce qui a été écrit,
 * sur des paniers tirés au hasard — est éprouvée par caisse-reglement.test.js, avec le reste de son
 * règlement. La fenêtre « Facturer la demande », par boutique-reglement.test.js.
 *
 * Chaque test a été vu ROUGE en réintroduisant le défaut qu'il gèle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { ventilerTva } = require('../lib/facturx.js');
const { articleRowTokens } = require('../lib/tokens.js');
const { montantFr } = require('../lib/montants.js');
const serveur = require('../lib/ttc.js');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const API = path.join(__dirname, '..');
const lireUi = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');
/** Le code seul : les commentaires RACONTENT l'ancien calcul, ils ne doivent pas compter. */
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
/** Les modules de l'écran, tels quels (src/app est en "type": "module"). */
const ecran = () => import(pathToFileURL(path.join(UI, 'lib', 'ttc.js')).href);
const panierDuStagiaire = () => import(pathToFileURL(path.join(UI, 'lib', 'cart.js')).href);

/** Des paniers tirés au hasard, toujours les mêmes. */
function tirage(graine) {
    return () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
}
const TAUX = [0, 2.1, 5.5, 10, 20];
const auCentime = (alea, max) => (1 + Math.floor(alea() * max)) / 100;

/* ── Une fausse base, pour la carte d'une demande : la base rend ses lignes ───────────────────── */
const ORG = 'org-1';
let b;
function base(o = {}) {
    b = { demandes: [], ...o };
    return b;
}
base();
const faux = {
    promise: () => ({
        query: async (sql) => {
            const q = plat(sql);
            if (/information_schema\.columns/i.test(q)) return [[{ 1: 1 }]]; // toutes les migrations jouées
            if (/FROM shop_request r JOIN learner l ON l\.id = r\.learner_id/.test(q) && /LEFT JOIN shop_request_line li/.test(q)) {
                return [b.demandes.map((r) => ({ ...r }))];
            }
            return [[]];
        },
    }),
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { listShopRequests } = require('../controllers/shopRequest.controller.js');

async function appeler(fn, req) {
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: ORG, id: 'u-bureau' }, params: {}, query: {}, body: {}, ...req }, res); }
    finally { console.error = avant; }
    await new Promise((f) => setImmediate(f));
    return r;
}
const dit = (r) => String(r.corps && (r.corps.error || r.corps.message));

/* ── LA FONCTION PARTAGÉE ─────────────────────────────────────────────────────────────────────── */

test('LA COPIE DE L\'ÉCRAN EST LE PDF — `totalFacture` contre `ventilerTva`, sur des milliers de paniers à plusieurs taux', async () => {
    const { totalFacture } = await ecran();
    const alea = tirage(20260930);
    const ecarts = [];
    let multi = 0, avantFaux = 0;
    for (let i = 0; i < 20000; i++) {
        const lignes = Array.from({ length: 1 + Math.floor(alea() * 6) }, () => ({
            ht: auCentime(alea, 300000), taux: TAUX[Math.floor(alea() * TAUX.length)],
        }));
        const exonere = alea() < 0.1;
        const pdf = ventilerTva({
            amountNet: Number(lignes.reduce((s, l) => s + l.ht, 0).toFixed(2)), tvaExoneree: exonere, taxRate: null,
            lines: lignes.map((l) => ({ amount: l.ht, taxRate: l.taux })),
        });
        for (const [qui, t] of [['écran', totalFacture(lignes, exonere)], ['serveur', serveur.totalFacture(lignes, exonere)]]) {
            if (t.ttc !== pdf.grand || t.tva !== pdf.taxe || t.ht !== pdf.base) {
                ecarts.push(`${qui}, ${JSON.stringify(lignes)}${exonere ? ' exonéré' : ''} : ${t.ttc} €, le PDF ${pdf.grand} €`);
            }
        }
        // Le calcul d'avant — la somme des TTC de ligne, arrondie à la fin — tombait-il à côté ?
        if (!exonere && new Set(lignes.map((l) => l.taux)).size > 1) {
            multi++;
            if (Number(lignes.reduce((s, l) => s + l.ht * (1 + l.taux / 100), 0).toFixed(2)) !== pdf.grand) avantFaux++;
        }
    }
    assert.deepStrictEqual(ecarts.slice(0, 5), [], 'un centime d\'écart, et l\'on encaisse un autre montant que celui qu\'on facture');
    assert.ok(avantFaux > multi / 10, `le tirage doit éprouver l'arrondi par taux : ${avantFaux} paniers sur ${multi} tombaient à côté avant`);

    assert.deepStrictEqual(totalFacture([]), { ht: 0, tva: 0, ttc: 0 }, 'rien à régler');
    assert.deepStrictEqual(serveur.totalFacture([]), { ht: 0, tva: 0, ttc: 0 }, 'et pas la ligne de repli de ventilerTva');
});

test('UNE LIGNE COMME LA FACTURE L\'IMPRIME — `ttcDeLigne`, contre la colonne « Total TTC » du PDF', async () => {
    const { ttcDeLigne, htDeLigne } = await ecran();
    const alea = tirage(4242);
    const ecarts = [];
    for (let i = 0; i < 20000; i++) {
        const prix = auCentime(alea, 30000), qte = 1 + Math.floor(alea() * 5), taux = TAUX[Math.floor(alea() * TAUX.length)];
        const ht = htDeLigne(prix, qte);
        const imprime = articleRowTokens({ amount: ht, taxRate: taux, qty: qte, unit_price_ht: prix, name: 'Article' }, 0)['Montant TTC'];
        const e = ttcDeLigne(prix, qte, taux);
        if (montantFr(e) !== imprime) ecarts.push(`${qte} × ${prix} € à ${taux} % : écran ${montantFr(e)}, facture ${imprime}`);
        if (serveur.ttcDeLigne(prix, qte, taux) !== e) ecarts.push(`${qte} × ${prix} € à ${taux} % : le serveur dit ${serveur.ttcDeLigne(prix, qte, taux)}`);
        // Un seul article : la ligne EST le total de la facture.
        const seul = ventilerTva({ amountNet: ht, tvaExoneree: false, taxRate: null, lines: [{ amount: ht, taxRate: taux }] }).grand;
        if (e !== seul) ecarts.push(`${qte} × ${prix} € à ${taux} % : ligne ${e}, total ${seul}`);
    }
    assert.deepStrictEqual(ecarts.slice(0, 5), []);

    /* Le demi-centime : 63 € HT à 5,5 % font 3,465 € de TVA. La carte de l'article calculait
       `(HT × 1,055).toFixed(2)` : 66,46 €, quand le panier et la facture disent 66,47 €. */
    assert.strictEqual(+(63 * (1 + 5.5 / 100)).toFixed(2), 66.46, 'le calcul d\'avant, pour mémoire');
    assert.strictEqual(ttcDeLigne(63, 1, 5.5), 66.47);
    assert.strictEqual(serveur.ttcDeLigne(63, 1, 5.5), 66.47);
    // Le taux manquant se lit comme la facture le lit : 20 %.
    assert.strictEqual(ttcDeLigne(10, 1, undefined), 12);
    assert.strictEqual(ttcDeLigne(10, 1, null), 12);
});

test('UNE DEMANDE BOUTIQUE — la facture de l\'école au centime, le partenaire ventilé à part, le « sur demande » signalé', async () => {
    const { totalDemande } = await ecran();
    const L = (source, prix, taux, qty = 1) => ({ source, qty, unit_price_ht: prix, tax_rate: taux });

    // Deux taux : 48,20 €, le total de la facture — plus 48,19 €, la somme des TTC de ligne.
    const deuxTaux = [L('ECOLE', 33.33, 20), L('ECOLE', 7.77, 5.5)];
    assert.deepStrictEqual(totalDemande(deuxTaux), { ht: 41.1, ttc: 48.2, facture: 48.2, aDefinir: false });

    /* Le partenaire facture lui-même : 25,00 € chez l'école, 25,00 € chez le partenaire — 50,00 €.
       Ventilés ensemble, les deux 20,83 € HT à 20 % donneraient 49,99 €, un montant que personne
       ne facture. */
    const mixte = [L('ECOLE', 20.83, 20), L('PARTENAIRE', 20.83, 20)];
    assert.deepStrictEqual(totalDemande(mixte), { ht: 41.66, ttc: 50, facture: 25, aDefinir: false });
    assert.strictEqual(serveur.totalFacture([{ ht: 20.83, taux: 20 }, { ht: 20.83, taux: 20 }]).ttc, 49.99, 'ventilés ensemble');

    // « Sur demande » : pas de prix, pas compté — et dit.
    const surDemande = [L('ECOLE', 50, 20), L('PARTENAIRE', null, 20)];
    assert.deepStrictEqual(totalDemande(surDemande), { ht: 50, ttc: 60, facture: 60, aDefinir: true });
    assert.deepStrictEqual(totalDemande([]), { ht: 0, ttc: 0, facture: 0, aDefinir: false });
    assert.deepStrictEqual(totalDemande(undefined), { ht: 0, ttc: 0, facture: 0, aDefinir: false });

    // Au hasard : l'écran et le serveur disent la même chose, et `facture` est le PDF des lignes ÉCOLE.
    const alea = tirage(777);
    const ecarts = [];
    for (let i = 0; i < 5000; i++) {
        const lignes = Array.from({ length: 1 + Math.floor(alea() * 6) }, () => L(
            alea() < 0.8 ? 'ECOLE' : 'PARTENAIRE', alea() < 0.1 ? null : auCentime(alea, 30000),
            [5.5, 10, 20][Math.floor(alea() * 3)], 1 + Math.floor(alea() * 3)));
        const e = totalDemande(lignes), s = serveur.totalDemande(lignes);
        if (JSON.stringify(e) !== JSON.stringify(s)) ecarts.push(`${JSON.stringify(lignes)} : écran ${JSON.stringify(e)}, serveur ${JSON.stringify(s)}`);
        // Les lignes que `invoiceShopRequest` écrit : ÉCOLE, à prix connu, HT au centime.
        const facturees = lignes.filter((l) => l.source === 'ECOLE' && l.unit_price_ht != null);
        const pdf = facturees.length ? ventilerTva({
            amountNet: 0, tvaExoneree: false, taxRate: null,
            lines: facturees.map((l) => ({ amount: Number((l.unit_price_ht * l.qty).toFixed(2)), taxRate: l.tax_rate })),
        }).grand : 0;
        if (e.facture !== pdf) ecarts.push(`${JSON.stringify(lignes)} : fenêtre ${e.facture}, facture ${pdf}`);
    }
    assert.deepStrictEqual(ecarts.slice(0, 5), []);
});

/* ── LES ÉCRANS ET LES CONTRÔLEURS ────────────────────────────────────────────────────────────── */

test('LE PANIER DU STAGIAIRE — `cartTotals` annonce le total de la facture', async () => {
    const { cartTotals } = await panierDuStagiaire();
    const ligne = (source, prix, taux, qty = 1) => ({ source, id: `${source}-${prix}`, label: 'Article', price_ht: prix, tax_rate: taux, qty });
    // 33,33 € à 20 % et 7,77 € à 5,5 % : le panier annonçait 48,19 €, la facture en demande 48,20 €.
    assert.deepStrictEqual(cartTotals([ligne('ECOLE', 33.33, 20), ligne('ECOLE', 7.77, 5.5)]), { ht: 41.1, ttc: 48.2, aDefinir: false });
    // Une offre partenaire « sur demande » (prix nul au panier) : pas comptée, et dite.
    assert.deepStrictEqual(cartTotals([ligne('ECOLE', 50, 20), ligne('PARTENAIRE', null, 20)]), { ht: 50, ttc: 60, aDefinir: true });

    const alea = tirage(31);
    const ecarts = [];
    for (let i = 0; i < 5000; i++) {
        const lignes = Array.from({ length: 1 + Math.floor(alea() * 5) }, () => ligne('ECOLE', auCentime(alea, 30000), [5.5, 10, 20][Math.floor(alea() * 3)], 1 + Math.floor(alea() * 3)));
        const pdf = ventilerTva({ amountNet: 0, tvaExoneree: false, taxRate: null,
            lines: lignes.map((l) => ({ amount: Number((l.price_ht * l.qty).toFixed(2)), taxRate: l.tax_rate })) }).grand;
        if (cartTotals(lignes).ttc !== pdf) ecarts.push(`${JSON.stringify(lignes)} : panier ${cartTotals(lignes).ttc}, facture ${pdf}`);
    }
    assert.deepStrictEqual(ecarts.slice(0, 5), []);
});

test('LA CARTE D\'UNE DEMANDE — `listShopRequests` rend le total de la facture, et ce que l\'écran calcule', async () => {
    const { totalDemande } = await ecran();
    const alea = tirage(2026);
    const rangees = [];
    const attendus = new Map();
    for (let d = 0; d < 300; d++) {
        const id = `dem-${d}`;
        const lignes = Array.from({ length: 1 + Math.floor(alea() * 5) }, (_, k) => ({
            source: alea() < 0.85 ? 'ECOLE' : 'PARTENAIRE',
            prix: alea() < 0.1 ? null : auCentime(alea, 30000),
            taux: [5.5, 10, 20][Math.floor(alea() * 3)], qty: 1 + Math.floor(alea() * 3), k,
        }));
        for (const l of lignes) {
            // La base rend ses décimaux en texte, comme mysql2.
            rangees.push({ id, ref: `BQ-${d}`, status: 'PRETE', note: null, admin_note: null, invoice_id: null,
                created_at: '2026-09-30', updated_at: '2026-09-30', pickup_at: null, company_id: null, company_name: null,
                learner_id: 'st-1', first_name: 'Jean', last_name: 'Martin', email: null, phone: null,
                discount_pct: null, unit_price_gross_ht: null, source: l.source, label: `Article ${l.k}`, qty: l.qty,
                unit_price_ht: l.prix == null ? null : l.prix.toFixed(2), tax_rate: l.taux.toFixed(2),
                personalization: null, variant: null, sort_order: l.k });
        }
        attendus.set(id, lignes);
    }
    base({ demandes: rangees });
    const r = await appeler(listShopRequests, {});
    assert.strictEqual(r.code, 200, dit(r));
    assert.strictEqual(r.corps.data.length, 300);
    const ecarts = [];
    let deuxTaux = 0;
    for (const dem of r.corps.data) {
        const lignes = attendus.get(dem.id);
        // Ce que l'écran calcule sur les lignes que la carte reçoit — la fenêtre en tire son total.
        const e = totalDemande(dem.lines);
        if (dem.total_ttc !== e.ttc || dem.tarif_a_definir !== e.aDefinir) ecarts.push(`${dem.ref} : carte ${dem.total_ttc}, écran ${e.ttc}`);
        const ecole = lignes.filter((l) => l.source === 'ECOLE' && l.prix != null);
        if (lignes.every((l) => l.source === 'ECOLE' && l.prix != null)) {
            const pdf = ventilerTva({ amountNet: 0, tvaExoneree: false, taxRate: null,
                lines: ecole.map((l) => ({ amount: Number((l.prix * l.qty).toFixed(2)), taxRate: l.taux })) }).grand;
            if (dem.total_ttc !== pdf) ecarts.push(`${dem.ref} : carte ${dem.total_ttc}, facture ${pdf}`);
            if (new Set(ecole.map((l) => l.taux)).size > 1
                && Number(ecole.reduce((s, l) => s + l.prix * l.qty * (1 + l.taux / 100), 0).toFixed(2)) !== pdf) deuxTaux++;
        }
    }
    assert.deepStrictEqual(ecarts.slice(0, 5), []);
    assert.ok(deuxTaux >= 15, `le tirage doit éprouver l'arrondi par taux : ${deuxTaux} cartes tombaient à côté avant`);
});

test('CHAQUE ÉCRAN APPELLE LA FONCTION PARTAGÉE — plus une somme de TTC de ligne nulle part', () => {
    const ttcEnLigne = /\(1 \+ [^()]*(\([^()]*\))?[^()]*\/ 100\)/;
    const fichiers = {
        'lib/cart.js': lireUi('lib/cart.js'),
        'pages/Boutique.jsx': lireUi('pages/Boutique.jsx'),
        'pages/DemandesBoutique.jsx': lireUi('pages/DemandesBoutique.jsx'),
        'pages/Ventes.jsx': lireUi('pages/Ventes.jsx'),
        'controllers/shopRequest.controller.js': lireApi('controllers/shopRequest.controller.js'),
        'controllers/espace.controller.js': lireApi('controllers/espace.controller.js'),
        'controllers/sale.controller.js': lireApi('controllers/sale.controller.js'),
    };
    for (const [f, src] of Object.entries(fichiers)) {
        assert.doesNotMatch(sansCommentaires(src), ttcEnLigne, `${f} : un TTC calculé à la main, (1 + taux / 100)`);
    }
    const code = (f) => plat(sansCommentaires(fichiers[f]));
    // Le panier, « Mes demandes », la carte et la fenêtre.
    assert.match(code('lib/cart.js'), /import \{ totalDemande \} from "\.\/ttc\.js";/);
    assert.match(code('lib/cart.js'), /export function cartTotals\(lines = read\(\)\) \{ const t = totalDemande\(/);
    assert.match(code('pages/Boutique.jsx'), /import \{ totalDemande, ttcDeLigne \} from "\.\.\/lib\/ttc\.js";/);
    assert.match(code('pages/Boutique.jsx'), /const t = totalDemande\(r\.lines\);/, '« Mes demandes »');
    assert.doesNotMatch(code('pages/Boutique.jsx'), /function totalDemande/, 'plus de copie locale');
    assert.match(code('pages/DemandesBoutique.jsx'), /const totalTtc = totalDemande\(d\.lines\)\.facture;/, 'la fenêtre « Facturer la demande »');
    /* La caisse : l'écran et le serveur (le détail — le total et la ligne de la page, le règlement —
       est tenu par caisse-reglement.test.js). Une seule fonction : la règle d'avant, lib/totalCaisse.js,
       qui arrondissait la TVA une fois sur le tout, est retirée des deux côtés. */
    assert.match(code('pages/Ventes.jsx'), /\.\.\.totalFacture\(lignesDuPanier\(cart, \{ remiseDeLigne, remiseGlobale, tvaApplies \}\), !tvaApplies\),/);
    assert.match(code('controllers/sale.controller.js'), /const \{ ht: totalHT, tva: totalTVA, ttc \} = totalFacture\(invLines\.map\(\(l\) => \(\{ ht: l\.amount_net, taux: l\.rate \}\)\), !tvaApplies\);/);
    for (const f of ['pages/Ventes.jsx', 'controllers/sale.controller.js']) assert.doesNotMatch(code(f), /totalCaisse/, `${f} : plus de seconde règle`);
    assert.ok(!fs.existsSync(path.join(UI, 'lib', 'totalCaisse.js')) && !fs.existsSync(path.join(API, 'lib', 'totalCaisse.js')), 'lib/totalCaisse.js est retirée');
    // La carte d'une demande, la notification d'une commande, et le prix d'un article.
    assert.match(code('controllers/shopRequest.controller.js'), /const t = totalDemande\(d\.lines\); return \{ \.\.\.d, total_ht: t\.ht, total_ttc: t\.ttc, tarif_a_definir: t\.aDefinir \};/);
    assert.match(code('controllers/espace.controller.js'), /const totalTTC = totalDemande\(resolved\.map\(\(r\) => \(\{ source: r\.source, qty: r\.qty, unit_price_ht: r\.price, tax_rate: r\.tax \}\)\)\)\.ttc;/);
    assert.match(code('controllers/espace.controller.js'), /price_ttc: ttcDeLigne\(netHt, 1, Number\(r\.tax_rate\)\),/);
    assert.match(code('controllers/espace.controller.js'), /price_ttc_avant: ttcDeLigne\(brutHt, 1, Number\(r\.tax_rate\)\),/);
});
