/**
 * LE RELEVÉ DES AUTRES SAISIES D'ARGENT (2026-09-30) — après la Comptabilité (montant-saisi.test.js),
 * la caisse, l'inventaire et les factures (montant-saisi-ventes.test.js).
 *
 * Même défaut, sept endroits de plus, chacun lu par `Number()` qui ne connaît que le point :
 *   · le TAUX DE TVA de l'organisme — `Number("5,5") || 0` : 0 % EN SILENCE sur tous les
 *     documents, et l'écran disait « Organisme enregistré » ;
 *   · la REMISE d'un partenaire — NaN parti dans l'INSERT (erreur 500), ou dans l'UPDATE, dont le
 *     refus passait pour « Migration 133 non jouée » ;
 *   · les PRIX d'un produit partenaire — NaN changé en `null` : le tarif négocié s'EFFAÇAIT ;
 *   · le PRIX de la mercuriale — `Number(v.replace(',', '.'))` : un « € », une espace, un
 *     séparateur de milliers, et le prix tombait à 0 € ;
 *   · les PRIX d'une fiche technique — `Number(v) || 0` : farine, ingrédients, sel, huile,
 *     levure à 0 €, un coût et un prix de vente conseillé faux ;
 *   · le MONTANT NET d'une formation et le MONTANT CPF d'un stagiaire — partis TELS QUELS dans un
 *     DECIMAL : MariaDB, en mode strict, refuse « 1250,00 » (erreur 500) ;
 *   · le SEUIL d'une condition de document — NaN enregistré `null`, et la condition comparait à rien.
 *
 * À L'ÉCRAN, ces champs étaient en `type="number"`, qui lit la virgule selon la langue de
 * l'APPAREIL et la rend VIDE là où elle n'est pas le séparateur décimal. Ils sont en texte
 * (`inputMode="decimal"`) ; ceux de la fiche technique, qui calcule à chaque frappe, passent par
 * ChampMontant : le texte reste à l'écran, l'état reçoit la valeur lue.
 *
 * Chaque test a été vu ROUGE en réintroduisant le défaut qu'il gèle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lireUi = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
/** Le code seul : les commentaires RACONTENT l'ancien `type="number"`, ils ne doivent pas compter. */
const sansCommentaires = (f) => lireUi(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();

/* ── Une fausse base : réponses par motif, écritures capturées ───────────────────────────────── */
const COLONNES_STAGIAIRE = ['first_name', 'last_name', 'email', 'financing', 'cpf_amount'];
let ecritures = [];
function repondre(q, p = []) {
    if (/CHARACTER_MAXIMUM_LENGTH/.test(q)) return [[{ n: 255 }]];
    if (/information_schema\.columns/i.test(q) && /table_name = 'learner'/.test(q)) return [COLONNES_STAGIAIRE.map((c) => ({ c }))];
    if (/information_schema\.columns/i.test(q)) return [[{ 1: 1 }]];
    if (/^SELECT company_id, financing, user_id, email FROM learner/.test(q)) return [[{ company_id: null, financing: 'PARTICULIER', user_id: null, email: 'marie@exemple.fr' }]];
    if (/^SELECT author_user_id FROM recipe/.test(q)) return [[{ author_user_id: 'u1' }]];
    if (/^SELECT id FROM partner WHERE id = \? AND organization_id = \?/.test(q)) return [[{ id: p[0] }]];
    if (/FROM mercuriale_item WHERE id = \?/.test(q)) return [[{ id: p[0], label: 'Mozzarella' }]];
    if (/^(INSERT|UPDATE|DELETE)/.test(q)) return [{ affectedRows: 1 }];
    return [[]];
}
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) ecritures.push({ q, p });
            return repondre(q, p);
        },
    }),
    query: (sql, p, cb) => {
        const f = typeof p === 'function' ? p : cb;
        const q = plat(sql);
        if (/^(INSERT|UPDATE|DELETE)/.test(q)) ecritures.push({ q, p });
        if (typeof f === 'function') f(null, /^SELECT/.test(q) ? [] : { affectedRows: 1 });
    },
    end: async () => {},
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const cheminModeles = require.resolve('../controllers/template.controller.js');
require.cache[cheminModeles] = {
    id: cheminModeles, filename: cheminModeles, loaded: true,
    exports: { loadOrgSteps: async () => [], getTemplateContent: async () => null },
};
const vraiMailer = require('../lib/mailer.js');
const cheminMailer = require.resolve('../lib/mailer.js');
require.cache[cheminMailer] = {
    id: cheminMailer, filename: cheminMailer, loaded: true,
    exports: { ...vraiMailer, sendMail: async () => ({ sent: false }), envoiPossible: () => false },
};

const { updateOrganization } = require('../controllers/organization.controller.js');
const partenaires = require('../controllers/partner.controller.js');
const mercuriale = require('../controllers/mercuriale.controller.js');
const { createRecipe, updateRecipe } = require('../controllers/recipe.controller.js');
const { createProgram, updateProgram } = require('../controllers/formationProgram.controller.js');
const { updateLearner } = require('../controllers/learner.controller.js');
const { validateCondition } = require('../lib/conditions.js');

async function appeler(fn, { body = {}, params = {} } = {}) {
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    ecritures = [];
    const avant = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'org-1', id: 'u1', role: 'SUPER_ADMIN' }, params, body, query: {}, headers: {} }, res); }
    finally { console.error = avant; }
    await new Promise((f) => setImmediate(f));
    return r;
}
const ecrit = (motif) => ecritures.filter((e) => motif.test(e.q));
const dit = (r) => String(r.corps && (r.corps.error || r.corps.message));
/** La valeur d'une colonne dans un INSERT … (cols) VALUES (…) ou un UPDATE … SET a = ?, b = ?. */
function valeur({ q, p }, colonne) {
    const ins = /^INSERT INTO \w+ \(([^)]*)\) VALUES \((.*)\)$/.exec(q);
    if (ins) {
        const places = ins[2].split(/,\s*/);
        let k = 0;
        for (const [i, c] of ins[1].split(/,\s*/).entries()) {
            if (c === colonne) return places[i] === '?' ? p[k] : places[i];
            if (places[i] === '?') k += 1;
        }
        throw new Error(`${colonne} absent de l'INSERT`);
    }
    const set = q.slice(q.indexOf(' SET ') + 5, q.lastIndexOf(' WHERE '));
    const parties = set.split(/,\s*(?![^()]*\))/).map((x) => x.trim());
    const i = parties.findIndex((x) => x.startsWith(`${colonne} = ?`) || x.startsWith(`${colonne}=?`));
    assert.ok(i >= 0, `${colonne} absent de l'UPDATE`);
    return p[parties.slice(0, i).reduce((n, x) => n + (x.match(/\?/g) || []).length, 0)];
}

/* ── LE SERVEUR ───────────────────────────────────────────────────────────────────────────────── */

test('L\'ORGANISME — un taux de TVA « 5,5 » s\'enregistre, au lieu de 0 % en silence', async () => {
    const r = await appeler(updateOrganization, { body: { legal_name: 'École Pizza', vat_rate: '5,5' } });
    assert.strictEqual(r.code, 200, dit(r));
    assert.strictEqual(valeur(ecrit(/^UPDATE organization/)[0], 'vat_rate'), '5.50', '`Number("5,5") || 0` faisait 0 %');
    const vide = await appeler(updateOrganization, { body: { vat_rate: '' } });
    assert.strictEqual(valeur(ecrit(/^UPDATE organization/)[0], 'vat_rate'), '0.00', 'vide : exonéré, comme avant');
    assert.strictEqual(vide.code, 200);

    const refus = await appeler(updateOrganization, { body: { legal_name: 'École Pizza', vat_rate: 'vingt' } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Taux de TVA illisible : écrivez-le par exemple 5,5\./);
    assert.strictEqual(ecrit(/^UPDATE organization/).length, 0, 'rien d\'autre ne part');
});

test('LES PARTENAIRES — une remise « 12,5 » s\'enregistre ; l\'illisible est refusé, sans erreur 500', async () => {
    const cree = await appeler(partenaires.createPartner, { body: { name: 'Moulin Bleu', discount_pct: '12,5' } });
    assert.strictEqual(cree.code, 201, dit(cree));
    assert.strictEqual(valeur(ecrit(/^INSERT INTO partner/)[0], 'discount_pct'), 12.5, 'NaN partait dans l\'INSERT');
    const maj = await appeler(partenaires.updatePartner, { params: { id: 'p1' }, body: { discount_pct: '7,5' } });
    assert.strictEqual(maj.code, 200, dit(maj));
    assert.strictEqual(valeur(ecrit(/^UPDATE partner/)[0], 'discount_pct'), 7.5);

    for (const fn of [partenaires.createPartner, partenaires.updatePartner]) {
        const refus = await appeler(fn, { params: { id: 'p1' }, body: { name: 'Moulin Bleu', discount_pct: 'dix' } });
        assert.strictEqual(refus.code, 422, fn.name);
        assert.match(dit(refus), /Remise illisible : écrivez-la par exemple 12,5\./);
        assert.strictEqual(ecrit(/^(INSERT INTO|UPDATE) partner\b/).length, 0);
    }
});

test('LES PRODUITS PARTENAIRES — « 39,90 » et « 1 234,50 » gardés ; le tarif ne s\'efface plus', async () => {
    const r = await appeler(partenaires.createPartnerProduct, { params: { id: 'p1' },
        body: { name: 'Four Stefano', price_public: '1 234,50', price_school: '39,90' } });
    assert.strictEqual(r.code, 201, dit(r));
    const ins = ecrit(/^INSERT INTO partner_product/)[0];
    assert.strictEqual(valeur(ins, 'price_public'), 1234.5);
    assert.strictEqual(valeur(ins, 'price_school'), 39.9, 'NaN devenait `null` : « tarif sur demande »');

    const maj = await appeler(partenaires.updatePartnerProduct, { params: { pid: 'pp1' }, body: { price_school: '35,5' } });
    assert.strictEqual(maj.code, 200, dit(maj));
    assert.strictEqual(valeur(ecrit(/^UPDATE partner_product/)[0], 'price_school'), 35.5);

    const refus = await appeler(partenaires.updatePartnerProduct, { params: { pid: 'pp1' }, body: { price_school: 'négocié' } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Tarif école illisible : écrivez-le par exemple 39,90\./);
    assert.strictEqual(ecrit(/^UPDATE partner_product/).length, 0, 'le prix n\'est plus effacé');
});

test('LA MERCURIALE — « 12,50 € » et « 1 234,5 » lus ; l\'illisible refusé au lieu de 0 €', async () => {
    const r = await appeler(mercuriale.createItem, { body: { label: 'Mozzarella', price: '12,50 €' } });
    assert.strictEqual(r.code, 201, dit(r));
    assert.strictEqual(valeur(ecrit(/^INSERT INTO mercuriale_item/)[0], 'prix_kg'), 12.5, 'le « € » donnait 0 €');
    const maj = await appeler(mercuriale.updateItem, { params: { id: 'm1' }, body: { price: '1 234,5' } });
    assert.strictEqual(maj.code, 200, dit(maj));
    assert.strictEqual(valeur(ecrit(/^UPDATE mercuriale_item/)[0], 'prix_kg'), 1234.5);
    const sansPrix = await appeler(mercuriale.createItem, { body: { label: 'Basilic' } });
    assert.strictEqual(valeur(ecrit(/^INSERT INTO mercuriale_item/)[0], 'prix_kg'), 0, 'absent : 0, comme avant');
    assert.strictEqual(sansPrix.code, 201);

    const refus = await appeler(mercuriale.updateItem, { params: { id: 'm1' }, body: { price: 'douze' } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Prix illisible : écrivez-le par exemple 12,50\./);
    assert.strictEqual(ecrit(/^UPDATE mercuriale_item/).length, 0);
});

test('LES FICHES TECHNIQUES — farine « 1,20 », mozzarella « 12,50 », sel « 0,50 » : aucun à 0 €', async () => {
    const fiche = {
        kind: 'RECETTE', name: 'Margherita', flour_price: '1,20',
        ingredients: [{ label: 'Mozzarella', qty: 130, unit: 'g', unit_price: '12,50' }],
        dough_params: { cooking: {}, prices: { sel: '0,50', levure: '' } },
    };
    const r = await appeler(createRecipe, { body: fiche });
    assert.strictEqual(r.code, 201, dit(r));
    const ins = ecrit(/^INSERT INTO recipe \(/)[0];
    assert.strictEqual(valeur(ins, 'flour_price'), 1.2, '`Number("1,20") || 0` : la farine à 0 €');
    assert.deepStrictEqual(JSON.parse(valeur(ins, 'dough_params')).prices, { sel: 0.5, levure: '' }, 'le sel restait une chaîne, lue 0 €');
    assert.strictEqual(valeur(ecrit(/^INSERT INTO recipe_ingredient/)[0], 'unit_price'), 12.5);

    const refus = await appeler(updateRecipe, { params: { id: 'r1' },
        body: { ...fiche, ingredients: [{ label: 'Mozzarella', qty: 130, unit: 'g', unit_price: 'cher' }] } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Prix illisible pour « Mozzarella » : écrivez-le par exemple 12,50\./);
    assert.strictEqual(ecritures.length, 0, 'refusée AVANT toute écriture : ni la fiche, ni ses ingrédients effacés');
});

test('LES FORMATIONS — un montant net « 1 250,00 » s\'enregistre, avec un point, au lieu d\'une erreur 500', async () => {
    const r = await appeler(createProgram, { body: { code: 'NIV2', title: 'Pizzaïolo niveau 2', price: '1 250,00' } });
    assert.strictEqual(r.code, 201, dit(r));
    assert.strictEqual(valeur(ecrit(/^INSERT INTO training_program/)[0], 'price'), '1250.00', '« 1 250,00 » partait tel quel');
    const maj = await appeler(updateProgram, { params: { id: 'f1' }, body: { price: '990,5' } });
    assert.strictEqual(valeur(ecrit(/^UPDATE training_program/)[0], 'price'), '990.50', dit(maj));

    const refus = await appeler(createProgram, { body: { code: 'NIV2', title: 'Pizzaïolo niveau 2', price: 'mille' } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Montant net illisible : écrivez-le par exemple 1250,00\./);
    assert.strictEqual(ecrit(/^INSERT INTO training_program/).length, 0);
});

test('LE STAGIAIRE — un montant CPF « 1 500,50 » s\'enregistre, et la fiche avec', async () => {
    const r = await appeler(updateLearner, { params: { id: 'l1' },
        body: { first_name: 'Marie', last_name: 'DUPONT', email: 'marie@exemple.fr', financing: 'CPF', cpf_amount: '1 500,50' } });
    assert.strictEqual(r.code, 200, dit(r));
    assert.strictEqual(valeur(ecrit(/^UPDATE learner SET/)[0], 'cpf_amount'), '1500.50', '« 1500,50 » partait tel quel : erreur 500');

    const refus = await appeler(updateLearner, { params: { id: 'l1' },
        body: { first_name: 'Marie', last_name: 'DUPONT', financing: 'CPF', cpf_amount: 'beaucoup' } });
    assert.strictEqual(refus.code, 422);
    assert.match(dit(refus), /Montant CPF illisible : écrivez-le par exemple 1500,00\./);
    assert.strictEqual(ecrit(/^UPDATE learner/).length, 0);
});

test('LES CONDITIONS — un seuil « 1 500 » ou « 12,5 » se lit ; l\'illisible est refusé, plus enregistré `null`', () => {
    const catalogue = [{ key: 'training_program.price', type: 'number', label: 'Prix de la formation' }];
    const cond = (op, value) => validateCondition(catalogue, { field: 'training_program.price', op, value });
    assert.deepStrictEqual(cond('gt', '1 500'), { ok: true, value: 1500 });
    assert.deepStrictEqual(cond('le', '12,5'), { ok: true, value: 12.5 }, '`Number("12,5")` : NaN, enregistré `null`');
    assert.deepStrictEqual(cond('gt', 'cher'), { ok: false, error: 'Valeur illisible : écrivez-la par exemple 1500 ou 12,5.' });
    // « parmi » : la virgule SÉPARE les valeurs — une liste de nombres s'écrit avec des points.
    assert.deepStrictEqual(cond('in', '12.5, 20'), { ok: true, value: [12.5, 20] });
    assert.strictEqual(cond('in', '12.5, vingt').ok, false, 'une valeur illisible partait en `null`');
});

/* ── L'ÉCRAN ──────────────────────────────────────────────────────────────────────────────────── */

test('L\'ÉCRAN — TVA, remise et prix des partenaires, formation, CPF : du texte, pré-rempli avec une virgule', () => {
    const cas = [
        ['pages/Reglages.jsx', /<Field label="Taux de TVA \(%\)" inputMode="decimal"/, /vat_rate: montantEnSaisie\(r\.data\.vat_rate\)/],
        ['pages/Partenaires.jsx', /<Field label="Remise \(%\)" inputMode="decimal"/, /f\.discount_pct = montantEnSaisie\(partner\.discount_pct\)/],
        ['components/PartnerProduits.jsx', /<input className="inp" inputMode="decimal" autoComplete="off" value=\{form\.price_public\}/, /montantEnSaisie\(p\[k\]\)/],
        ['pages/Formations.jsx', /inputMode="decimal" autoComplete="off" value=\{form\.price\}/, /f\.price = montantEnSaisie\(program\.price\)/],
        ['components/EditStagiaireModal.jsx', /<Field label="Montant CPF \(€\)" inputMode="decimal"/, /form\.cpf_amount = montantEnSaisie\(d\.cpf_amount\)/],
    ];
    for (const [f, champ, preRempli] of cas) {
        const src = sansCommentaires(f);
        assert.match(src, champ, `${f} : le champ doit être du texte en inputMode="decimal"`);
        assert.match(src, preRempli, `${f} : la valeur de la base doit s'afficher avec une virgule`);
    }
    assert.match(sansCommentaires('components/PartnerProduits.jsx'), /inputMode="decimal" autoComplete="off" value=\{form\.price_school\}/);
    assert.doesNotMatch(sansCommentaires('components/PartnerProduits.jsx'), /type="number"/);
});

test('L\'ÉCRAN — la mercuriale lit le prix en français, et n\'envoie pas l\'illisible', () => {
    const src = sansCommentaires('components/Mercuriale.jsx');
    assert.doesNotMatch(src, /Number\(String\(e\.target\.value\)\.replace\(",", "\."\)\)/, 'un « € » donnait NaN, puis 0 €');
    assert.match(src, /const v = lireMontant\(saisie\);/);
    assert.match(src, /if \(Number\.isFinite\(v\) && v !== num\(m\.price\)\) patch\(m\.id, \{ price: v, source: "MANUEL" \}\);/);
    assert.match(src, /Prix illisible : écrivez-le par exemple 12,50\./);
});

test('L\'ÉCRAN — la fiche technique garde « 12,5 » à l\'écran et calcule sur « 12.5 »', async () => {
    const { valeurTransmise, texteAJour } = await import(pathToFileURL(path.join(UI, 'lib', 'montantSaisi.js')).href);
    assert.strictEqual(valeurTransmise('12,5'), '12.5', 'l\'état reçoit un nombre écrit avec un point');
    assert.strictEqual(valeurTransmise('1 234,50 €'), '1234.5');
    assert.strictEqual(valeurTransmise(''), '', 'un champ vidé');
    assert.strictEqual(valeurTransmise('douze'), null, 'l\'illisible n\'est PAS transmis');
    assert.strictEqual(texteAJour('12,', '12'), '12,', 'la frappe en cours n\'est pas écrasée');
    assert.strictEqual(texteAJour('12,5', '14'), '14', 'un prix repris par ailleurs remplace le texte');
    assert.strictEqual(texteAJour('1,2', 1.2), '1,2');
    assert.strictEqual(texteAJour('', ''), '');

    const champ = sansCommentaires('components/ChampMontant.jsx');
    assert.match(champ, /inputMode="decimal"/);
    assert.match(champ, /if \(v !== null\) onChange\(\{ target: \{ value: v \} \}\);/);
    const fiche = sansCommentaires('pages/FicheRecette.jsx');
    assert.strictEqual((fiche.match(/<ChampMontant /g) || []).length, 4, 'ingrédient, farine (deux fois), prix de la pâte');
    assert.doesNotMatch(fiche, /type="number" step="0\.01"/, 'plus aucun prix en champ numérique');
    assert.doesNotMatch(fiche, /type="number" min="0" step="0\.1" inputMode="decimal"/);
});
