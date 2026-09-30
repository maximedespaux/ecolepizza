/**
 * LE RÈGLEMENT D'UNE DEMANDE BOUTIQUE TOMBE SUR LE TOTAL DE SA FACTURE — relevé le 2026-09-30.
 *
 * LE DÉFAUT. `POST /api/boutique/demandes/:id/facture` enregistrait la ventilation du règlement
 * (`payment_split`) sans jamais l'additionner. La caisse le fait (`checkout`), /factures aussi
 * (`reglementDe`) ; ici, rien. Et l'écran aidait : la fenêtre « Facturer la demande » envoyait
 * `resolvePayments(...).parts` en ne s'arrêtant que sur un montant ILLISIBLE. Un DÉPASSEMENT — que
 * le composant affichait pourtant en rouge, « Dépassement de 90 € » — partait quand même : 150 €
 * « en espèces » pour 60 € dus, et la facture imprimait des « Moyens et montants réglés » qui ne
 * bouclaient pas avec son propre total.
 *
 * Ce fichier gèle :
 *   · le serveur : la somme des parts tombe sur le TTC, à un centime près, sinon 422 — AVANT le
 *     numéro de facture, dont la séquence ne souffre aucun trou ;
 *   · ce TTC est celui du PDF (`ventilerTva`, TVA arrondie par taux), pas une somme de TTC de ligne ;
 *   · le centime de tolérance, qui SERT : l'écran additionne les TTC de ligne, et ce qu'il envoie
 *     doit toujours passer ;
 *   · sans aucune part, rien n'est vérifié : la facture naît PAYÉE avec `payment_method` seul ;
 *   · l'écran : un bouton qui attend sur un dépassement — sans attendre quand aucun moyen de
 *     paiement n'est configuré.
 *
 * Chaque test a été vu ROUGE en réintroduisant le défaut qu'il gèle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { lireMontant } = require('../lib/montantSaisi.js');
const { ventilerTva } = require('../lib/facturx.js');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lireUi = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
/** Le code seul : les commentaires RACONTENT l'ancien défaut, ils ne doivent pas compter. */
const sansCommentaires = (f) => lireUi(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();

/* ── Une fausse base : réponses par motif, écritures capturées ───────────────────────────────── */
const ORG = 'org-1';
/** Une ligne de demande telle que la base la rend : les décimaux en texte. */
const ligne = (label, prix, taux, qty = 1) => ({
    label, qty, unit_price_ht: prix, tax_rate: taux, personalization: null, variant: null, discount_pct: null, unit_price_gross_ht: null,
});
const TABLIER = [ligne('Tablier', '50.00', '20.00')];                                        // 60,00 € TTC
const PELLE = [ligne('Pelle à enfourner', '100.00', '20.00')];                               // 120,00 € TTC
/* Deux taux : la TVA s'arrondit PAR TAUX. 33,33 + 6,67 (20 %) et 7,77 + 0,43 (5,5 %) : 48,20 € sur
   la facture — et 48,19 € en additionnant les TTC de ligne (39,996 + 8,19735). */
const DEUX_TAUX = [ligne('Pelle ronde', '33.33', '20.00'), ligne('Farine type 00', '7.77', '5.50')];
const EMETTEUR = { id: 'emet-1', organization_id: ORG, is_default: 1, invoice_prefix: 'BQ', next_number: 12, number_format: null };

let b;
function base(o = {}) {
    b = { lignes: TABLIER, emetteur: null, requetes: [], ecritures: [], ...o };
    return b;
}
base();
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            b.requetes.push({ q, p });
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) { b.ecritures.push({ q, p }); return [{ affectedRows: 1 }]; }
            if (/information_schema\.columns/i.test(q)) return [[{ 1: 1 }]]; // toutes les migrations jouées
            if (/FROM shop_request r JOIN learner/.test(q)) {
                return [[{ id: 'dem-1', ref: 'BQ-17', status: 'PAYE', invoice_id: null, first_name: 'Jean', last_name: 'Martin', company_id: null, company_name: null }]];
            }
            if (/FROM shop_request_line/.test(q)) return [b.lignes.map((l) => ({ ...l }))];
            if (/^SELECT \* FROM billing_profile/.test(q)) return [b.emetteur ? [{ ...b.emetteur }] : []];
            if (/^SELECT id FROM invoice WHERE number = \?/.test(q)) return [[{ id: 'inv-bq' }]];
            return [[]];
        },
    }),
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { invoiceShopRequest } = require('../controllers/shopRequest.controller.js');

async function facturer(corps, o) {
    base(o);
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try { await invoiceShopRequest({ user: { organization_id: ORG, id: 'u-bureau' }, params: { id: 'dem-1' }, body: corps }, res); }
    finally { console.error = avant; }
    return r;
}
const ecrit = (motif) => b.ecritures.filter((e) => motif.test(e.q));
const dit = (r) => String(r.corps && (r.corps.error || r.corps.message));
/** Les valeurs d'un INSERT, par colonne — sans les places qui ne sont pas des `?` (uuid()). */
function colonnes({ q, p }) {
    const [, cols, places] = /^INSERT INTO \w+ \(([^)]*)\) VALUES \((.*)\)$/.exec(q);
    const vals = places.split(/,\s*/);
    const o = {};
    let k = 0;
    cols.split(/,\s*/).forEach((c, i) => { if (vals[i] === '?') o[c] = p[k++]; });
    return o;
}
/** Le numéro a-t-il été pris ? Deux séquences : celle de l'émettrice, ou le compteur BQ historique. */
const numeroPris = () => ecrit(/^UPDATE billing_profile SET next_number/).length
    + b.requetes.filter((x) => /^SELECT number FROM invoice/.test(x.q)).length;
/** Rien n'est parti : ni facture, ni ligne, ni demande marquée facturée, ni NUMÉRO consommé. */
function rienEcrit(quoi) {
    assert.deepStrictEqual(b.ecritures.map((e) => e.q.slice(0, 50)), [], `${quoi} : rien ne doit être écrit`);
    assert.strictEqual(numeroPris(), 0, `${quoi} : refusé AVANT le numéro — la séquence ne souffre aucun trou`);
}
/** Le total que le PDF calculera, relu DANS CE QUI A ÉTÉ ÉCRIT — comme `loadInvoiceData` le relit. */
function ttcEcrit() {
    const f = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
    const lignes = ecrit(/^INSERT INTO invoice_line/).map(colonnes);
    return ventilerTva({
        amountNet: f.amount_net, tvaExoneree: !!f.tva_exoneree, taxRate: f.tax_rate ?? null,
        lines: lignes.map((l) => ({ amount: Number(l.amount_net), taxRate: l.tax_rate ?? null })),
    }).grand;
}

/* ── LE SERVEUR ───────────────────────────────────────────────────────────────────────────────── */

test('UN DÉPASSEMENT — 150 € « en espèces » pour 60 € dus : refusé, en disant les deux montants', async () => {
    // Ce que l'écran envoyait : la part saisie, et le solde négatif du dernier moyen écarté.
    const r = await facturer({ payments: [{ method: 'Espèces', amount: 150 }] });
    assert.strictEqual(r.code, 422, 'la facture naissait avec 150 € « réglés » pour 60 € de total');
    assert.strictEqual(dit(r), 'La répartition des paiements (150,00 €) ne correspond pas au total à régler (60,00 €).',
        'le message de la caisse, montants à la française');
    rienEcrit('dépassement');
});

test('TROP PEU — 30 € + 10 € pour 60 € dus : refusé de même', async () => {
    const r = await facturer({ payments: [{ method: 'Espèces', amount: '30' }, { method: 'CB', amount: '10' }] });
    assert.strictEqual(r.code, 422);
    assert.match(dit(r), /\(40,00 €\) ne correspond pas au total à régler \(60,00 €\)/);
    rienEcrit('règlement insuffisant');
});

test('LE REFUS PASSE AVANT LE NUMÉRO — celui de l\'émettrice comme le compteur BQ', async () => {
    const trop = { payments: [{ method: 'Espèces', amount: 150 }] };
    /* Avec une émettrice, prendre un numéro est une ÉCRITURE (`next_number`) : un refus placé
       après elle laisserait un trou dans une séquence que la loi veut continue. */
    assert.strictEqual((await facturer(trop, { emetteur: EMETTEUR })).code, 422);
    rienEcrit('dépassement, avec émettrice');
    assert.strictEqual((await facturer(trop)).code, 422);
    rienEcrit('dépassement, compteur BQ');

    // Et la même demande, réglée juste, prend bien SON numéro — une fois.
    const ok = await facturer({ payments: [{ method: 'Espèces', amount: 60 }] }, { emetteur: EMETTEUR });
    assert.strictEqual(ok.code, 201, dit(ok));
    assert.strictEqual(ok.corps.number, `BQ-${new Date().getFullYear()}-0012`);
    assert.deepStrictEqual(ecrit(/^UPDATE billing_profile SET next_number/).map((e) => e.p), [[13, 'emet-1']]);
});

test('UN RÈGLEMENT QUI BOUCLE — « 30,50 » + « 29,50 » pour 60 € : la facture naît payée, détail gardé', async () => {
    const r = await facturer({ payments: [{ method: 'Espèces', amount: '30,50' }, { method: 'CB', amount: '29,50' }] });
    assert.strictEqual(r.code, 201, dit(r));
    const f = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
    assert.strictEqual(f.status, 'PAYEE');
    assert.strictEqual(f.payment_method, 'Espèces + CB');
    assert.deepStrictEqual(JSON.parse(f.payment_split), [{ method: 'Espèces', amount: 30.5 }, { method: 'CB', amount: 29.5 }]);
    assert.strictEqual(ttcEcrit(), 60, 'et la somme des parts est le total que le PDF imprimera');
});

test('UN CENTIME DE TOLÉRANCE, À TOUS LES MONTANTS — pas selon les caprices du flottant', async () => {
    /* Écrite comme à la caisse, `Math.abs(somme - ttc) > 0.01`, la tolérance ne tient pas : en
       flottant, 120,01 − 120 vaut 0,01000000000000512 — refusé —, quand 60,01 − 60 vaut
       0,00999999999999801 — accepté. Le même centime, deux verdicts. */
    for (const [lignes, total] of [[TABLIER, 60], [PELLE, 120]]) {
        for (const [ecart, code] of [[0, 201], [0.01, 201], [-0.01, 201], [0.02, 422], [-0.02, 422]]) {
            const regle = Number((total + ecart).toFixed(2));
            const r = await facturer({ payments: [{ method: 'CB', amount: regle }] }, { lignes });
            assert.strictEqual(r.code, code, `${regle} € réglés pour ${total} € dus`);
            if (code === 422) rienEcrit(`${regle} € pour ${total} €`);
        }
    }
    // Le centime se compte sur la SOMME : trois parts dont l'addition flottante ne tombe pas rond.
    const r = await facturer({ payments: [{ method: 'Espèces', amount: '0,10' }, { method: 'Chèque', amount: '0,20' }, { method: 'CB', amount: '59,70' }] });
    assert.strictEqual(r.code, 201, dit(r));
});

test('LE TOTAL EST CELUI DU PDF — la TVA arrondie PAR TAUX, pas une somme de TTC de ligne', async () => {
    /* 33,33 € à 20 % et 7,77 € à 5,5 % : 48,20 € sur la facture, 48,19 € ligne à ligne. */
    const juste = await facturer({ payments: [{ method: 'CB', amount: '48,20' }] }, { lignes: DEUX_TAUX });
    assert.strictEqual(juste.code, 201, dit(juste));
    assert.strictEqual(ttcEcrit(), 48.2, 'le total relu dans les lignes ÉCRITES, par la fonction du PDF');
    const f = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
    assert.strictEqual(f.amount_net, '41.10', 'le HT, avec un point');
    assert.ok(!('tax_rate' in f), 'deux taux : aucun taux d\'en-tête, chaque ligne porte le sien');
    assert.deepStrictEqual(ecrit(/^INSERT INTO invoice_line/).map(colonnes).map((l) => [l.amount_net, l.tax_rate]), [['33.33', 20], ['7.77', 5.5]]);

    // Ce que l'écran envoie — et ce qui a été encaissé : 48,19 €, à un centime. Accepté.
    const encaisse = await facturer({ payments: [{ method: 'CB', amount: '48,19' }] }, { lignes: DEUX_TAUX });
    assert.strictEqual(encaisse.code, 201, dit(encaisse));

    // Ces deux montants départagent les deux calculs : à un centime de l'un, à deux de l'autre.
    const auDessus = await facturer({ payments: [{ method: 'CB', amount: '48,21' }] }, { lignes: DEUX_TAUX });
    assert.strictEqual(auDessus.code, 201, '48,21 € : un centime au-dessus de 48,20 € — deux au-dessus de 48,19 €');
    const enDessous = await facturer({ payments: [{ method: 'CB', amount: '48,18' }] }, { lignes: DEUX_TAUX });
    assert.strictEqual(enDessous.code, 422, '48,18 € : deux centimes sous 48,20 € — un seul sous 48,19 €');
    assert.match(dit(enDessous), /\(48,18 €\) ne correspond pas au total à régler \(48,20 €\)/, 'le total annoncé est celui de la facture');
    rienEcrit('deux centimes sous le total du PDF');

    // Les quantités comptent, et le HT de ligne est celui qui s'écrit : 3 × 9,99 = 29,97 → 35,96 €.
    const trois = await facturer({ payments: [{ method: 'CB', amount: '35,96' }] }, { lignes: [ligne('Coupe-pâte', '9.99', '20.00', 3)] });
    assert.strictEqual(trois.code, 201, dit(trois));
    assert.strictEqual(ttcEcrit(), 35.96);
});

test('AUCUNE PART — rien n\'est vérifié : la facture naît PAYÉE avec `payment_method` seul, comme avant', async () => {
    const seul = await facturer({ payment_method: 'Virement' });
    assert.strictEqual(seul.code, 201, dit(seul));
    const f = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
    assert.strictEqual(f.status, 'PAYEE');
    assert.strictEqual(f.payment_method, 'Virement');
    assert.ok(!('payment_split' in f), 'aucune ventilation à écrire');

    /* Ce que l'écran envoie quand aucun moyen de paiement n'est configuré : une liste VIDE (la
       ligne sans moyen est écartée). Et ce qu'un corps posté à la main peut porter : une part sans
       moyen, une part sans montant. Aucune ne compte — il n'y a rien à additionner. */
    for (const payments of [[], [{ method: '', amount: 150 }], [{ method: 'CB', amount: '' }], [{ method: 'CB', amount: 0 }]]) {
        const r = await facturer({ payments });
        assert.strictEqual(r.code, 201, `${JSON.stringify(payments)} : ${dit(r)}`);
        const sans = colonnes(ecrit(/^INSERT INTO invoice \(/)[0]);
        assert.ok(!('payment_split' in sans) && !('payment_method' in sans), JSON.stringify(payments));
    }
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
const { resolvePayments } = bloc('components/PaiementSplit.jsx', 'export const estCheque', 'export default', ['resolvePayments']);
const { blocageReglement } = bloc('pages/DemandesBoutique.jsx', 'const blocageReglement', 'function FacturerModal', ['blocageReglement']);
/** Le « Total encaissé » de la fenêtre, par SA formule, lue dans la page : `d` est la demande. */
const totalFenetre = (() => {
    const formule = /const totalTtc = [^;]+;/.exec(lireUi('pages/DemandesBoutique.jsx'));
    assert.ok(formule, 'DemandesBoutique.jsx : le total de la fenêtre doit s\'appeler totalTtc');
    return new Function('d', `${formule[0]}\nreturn totalTtc;`);
})();

/** Des paniers tirés au hasard, toujours les mêmes : prix au centime, 1 à 3 exemplaires, 1 à 5 lignes. */
function paniers(n, tauxPossibles) {
    let graine = 20260930;
    const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
    return Array.from({ length: n }, () => Array.from({ length: 1 + Math.floor(alea() * 5) }, () => ({
        prix: (1 + Math.floor(alea() * 30000)) / 100, qty: 1 + Math.floor(alea() * 3), taux: tauxPossibles[Math.floor(alea() * tauxPossibles.length)],
    })));
}
/** La demande telle que `GET /boutique/demandes` la rend à l'écran : des nombres. */
const demande = (panier) => ({ lines: panier.map((l, i) => ({ source: 'ECOLE', label: `Article ${i + 1}`, qty: l.qty, unit_price_ht: l.prix, tax_rate: l.taux })) });
/** … et ses lignes telles que la base les rend au serveur : les décimaux en texte. */
const lignesDe = (panier) => panier.map((l, i) => ligne(`Article ${i + 1}`, l.prix.toFixed(2), l.taux.toFixed(2), l.qty));
const centimes = (n) => Math.round(n * 100);

test('L\'ÉCRAN — son « Total encaissé » : les seules lignes ÉCOLE à prix connu, celles que le serveur facture', () => {
    const d = { lines: [
        { source: 'ECOLE', label: 'Tablier', qty: 1, unit_price_ht: 50, tax_rate: 20 },
        { source: 'PARTENAIRE', label: 'Four électrique', qty: 1, unit_price_ht: 1500, tax_rate: 20 },
        { source: 'ECOLE', label: 'Sur demande', qty: 1, unit_price_ht: null, tax_rate: 20 },
    ] };
    assert.strictEqual(totalFenetre(d), 60, 'ni la ligne partenaire, ni celle dont le prix reste à définir');
    assert.strictEqual(totalFenetre({}), 0);
    // Deux taux : la fenêtre additionne les TTC de ligne, comme le panier du stagiaire — 48,19 €.
    assert.strictEqual(centimes(totalFenetre(demande([{ prix: 33.33, qty: 1, taux: 20 }, { prix: 7.77, qty: 1, taux: 5.5 }]))), 4819);
});

test('L\'ÉCRAN — ce qu\'il envoie passe TOUJOURS : un centime d\'écart avec la facture, jamais deux', async () => {
    let unCentime = 0;
    for (const panier of paniers(400, [5.5, 10, 20])) {
        // La fenêtre : 10 € en espèces quand le total le permet, le solde sur le dernier moyen.
        const total = totalFenetre(demande(panier));
        const saisie = total > 10 ? [{ method: 'Espèces', amount: '10' }, { method: 'CB', amount: '' }] : [{ method: 'CB', amount: '' }];
        const reglement = resolvePayments(saisie, total);
        assert.strictEqual(blocageReglement(reglement), null);

        /* L'école a encaissé CE total-là, et ne peut pas en saisir un autre : le solde du dernier
           moyen se calcule. Un refus ici la laisserait sans recours. */
        const r = await facturer({ payments: reglement.parts }, { lignes: lignesDe(panier) });
        assert.strictEqual(r.code, 201, `${JSON.stringify(panier)} : ${dit(r)}`);
        const split = JSON.parse(colonnes(ecrit(/^INSERT INTO invoice \(/)[0]).payment_split);
        const ecart = Math.abs(centimes(split.reduce((s, p) => s + p.amount, 0)) - centimes(ttcEcrit()));
        assert.ok(ecart <= 1, `${JSON.stringify(panier)} : ${ecart} centimes entre le règlement et le total de la facture`);
        if (ecart === 1) unCentime++;
    }
    assert.ok(unCentime >= 40, `le tirage doit éprouver la tolérance : ${unCentime} paniers à un centime`);

    // Un seul taux n'en protège pas : 63 € à 5,5 % font 3,465 € de TVA — 66,47 € facturés, 66,46 € à l'écran.
    const demi = [{ prix: 31.5, qty: 2, taux: 5.5 }];
    const envoye = resolvePayments([{ method: 'CB', amount: '' }], totalFenetre(demande(demi))).parts;
    assert.deepStrictEqual(envoye, [{ method: 'CB', amount: 66.46 }]);
    assert.strictEqual((await facturer({ payments: envoye }, { lignes: lignesDe(demi) })).code, 201);
    assert.strictEqual(ttcEcrit(), 66.47);
});

test('L\'ÉCRAN — « Créer la facture » attend sur un DÉPASSEMENT, pas seulement sur l\'illisible', () => {
    // 150 € en espèces pour 60 € : le solde du dernier moyen est négatif, il est écarté…
    const trop = resolvePayments([{ method: 'Espèces', amount: '150' }, { method: 'CB', amount: '' }], 60);
    assert.strictEqual(trop.reste, -90);
    assert.deepStrictEqual(trop.parts, [{ method: 'Espèces', amount: 150 }], '… et c\'est CE règlement qui partait');
    assert.strictEqual(blocageReglement(trop), 'La répartition du règlement dépasse le total à régler.',
        'le bouton n\'attendait que sur un montant illisible');
    // D'un centime aussi ; et tout le total sur le premier moyen n'est PAS un dépassement.
    assert.ok(blocageReglement(resolvePayments([{ method: 'Espèces', amount: '60,01' }, { method: 'CB', amount: '' }], 60)));
    assert.strictEqual(blocageReglement(resolvePayments([{ method: 'Espèces', amount: '60' }, { method: 'CB', amount: '' }], 60)), null);
    assert.strictEqual(blocageReglement(resolvePayments([{ method: 'Espèces', amount: '30,50' }, { method: 'CB', amount: '' }], 60)), null);

    // L'illisible bloque toujours, et c'est LUI que le bouton dit — même si le reste dépasse.
    const illisible = resolvePayments([{ method: 'Espèces', amount: 'cent' }, { method: 'Chèque', amount: '150' }, { method: 'CB', amount: '' }], 60);
    assert.strictEqual(blocageReglement(illisible), 'Montant illisible pour « Espèces » : écrivez-le par exemple 300,50.');

    /* LE PIÈGE : bloquer sur `valid`. Il est faux aussi quand AUCUN moyen de paiement n'est
       configuré — la ligne n'a pas de moyen —, et là on doit pouvoir facturer sans règlement. */
    const sansMoyen = resolvePayments([{ method: '', amount: '' }], 60);
    assert.ok(!sansMoyen.valid, 'une ligne sans moyen n\'est pas une répartition « valide »…');
    assert.strictEqual(blocageReglement(sansMoyen), null, '… mais elle ne doit pas empêcher de facturer');
    assert.deepStrictEqual(sansMoyen.parts, [], 'aucune part ne part : la facture naît payée, sans règlement détaillé');

    const page = lireUi('pages/DemandesBoutique.jsx');
    assert.match(page, /const blocage = blocageReglement\(resolvePayments\(paiements, totalTtc\)\);/);
    assert.match(page, /<button className="btn primary" disabled=\{busy \|\| !!blocage\}\s+title=\{blocage \|\| undefined\}/,
        'le bouton attend, et son info-bulle dit pourquoi');
    assert.doesNotMatch(sansCommentaires('pages/DemandesBoutique.jsx'), /\.valid\b/, 'jamais `valid` tout court, cf. ci-dessus');
});
