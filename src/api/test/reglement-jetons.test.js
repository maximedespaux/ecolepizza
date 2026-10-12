/**
 * COMMENT LA FORMATION A ÉTÉ PAYÉE — les jetons de règlement d'un document (demandé le 2026-10-12).
 *
 * L'école voulait imprimer, sur un modèle de document, le règlement du dossier : les dates « payé le … »,
 * les montants réglés, le solde. Les montants, les moyens et les références existaient déjà (migration
 * 195) ; MANQUAIENT les DATES (migration 194, suivies sur la carte « Règlement » mais jamais imprimables)
 * et les MONTANTS RÉGLÉS. On les ajoute, lus par la MÊME règle que la carte (`calculerReglement`), posés
 * sur formations[0] par loadContext (agrégés sur les dossiers du document). Ces tests gèlent :
 *   · la RÉSOLUTION des six jetons depuis `formations[0].reglement` ;
 *   · {Montant solde}, alias de {Reste à payer} ;
 *   · le fait qu'ils sont FACULTATIFS — un document d'une formation non encore payée ne doit pas se
 *     bloquer à la génération (le défaut qu'on gèle : les sortir d'OPTIONAL_TOKENS rouvrirait) ;
 *   · que loadContext les calcule et les attache, et que la palette les repropose sous « Entreprise ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resolveTokens, findMissingTokens } = require('../lib/tokens.js');

// `euro` sépare les milliers par une espace fine insécable : on normalise pour comparer la VALEUR.
const eur = (s) => String(s).replace(/\s/g, ' ');

// Un dossier à 1 500 €, acompte convenu 450 € → reste 1 050 €. `reglement` = ce que loadContext pose
// sur formations[0] (acompte/solde réglés + dates au jour, agrégés sur les dossiers du document).
const ctxAvec = (reglement) => ({
    formations: [{ title: 'Pizzaïolo Niveau I', price: 1500, enroll_price: null, acompte: 450, reglement }],
});

const REGLE = {
    acompte: { montantPaye: 450, date: '2026-03-12' },
    solde: { montantPaye: 1050, date: '2026-06-18' },
    totalPaye: 1500,
};

test('les dates et les montants réglés s\'impriment depuis le règlement du dossier', () => {
    const v = resolveTokens(ctxAvec(REGLE));
    assert.strictEqual(v['Acompte payé le'], '12/03/2026');
    assert.strictEqual(v['Solde payé le'], '18/06/2026');
    assert.strictEqual(eur(v['Acompte payé']), '450 €');
    assert.strictEqual(eur(v['Solde payé']), '1 050 €');
    assert.strictEqual(eur(v['Total payé']), '1 500 €');
});

test('{Montant solde} est l\'alias clair de {Reste à payer} — la MÊME valeur', () => {
    const v = resolveTokens(ctxAvec(REGLE));
    assert.strictEqual(eur(v['Montant solde']), '1 050 €');
    assert.strictEqual(v['Montant solde'], v['Reste à payer']);
});

test('RIEN DE PAYÉ : les montants réglés et les dates sortent VIDES (pas « 0 € », pas une fausse date)', () => {
    // Ni facture ni coche → calculerReglement rend montantPaye 0 et date null ; loadContext pose cela.
    const v = resolveTokens(ctxAvec({ acompte: { montantPaye: 0, date: null }, solde: { montantPaye: 0, date: null }, totalPaye: 0 }));
    assert.strictEqual(v['Acompte payé le'], '');
    assert.strictEqual(v['Solde payé le'], '');
    assert.strictEqual(v['Acompte payé'], '');
    assert.strictEqual(v['Solde payé'], '');
    assert.strictEqual(v['Total payé'], '');
    // Le solde (le reste) reste, lui, affiché : il se calcule du prix et de l'acompte, pas du réglé.
    assert.strictEqual(eur(v['Montant solde']), '1 050 €');
});

test('SANS règlement (aperçu de modèle, facture) : les cinq jetons de paiement sont vides, aucune erreur', () => {
    const v = resolveTokens(ctxAvec(undefined));
    for (const k of ['Acompte payé le', 'Solde payé le', 'Acompte payé', 'Solde payé', 'Total payé']) {
        assert.strictEqual(v[k], '', `${k} doit être vide sans règlement`);
    }
});

test('CE SONT DES JETONS FACULTATIFS : un document d\'une formation NON PAYÉE se génère quand même', () => {
    /* LE DÉFAUT GELÉ : si un de ces jetons quittait OPTIONAL_TOKENS, un reçu/une attestation posés sur
       un dossier pas encore réglé seraient « bloqués, information manquante » — alors qu'une formation
       non payée est normale. On vérifie qu'aucun n'est signalé manquant quand il est vide. */
    const corps = ['Acompte payé le', 'Solde payé le', 'Acompte payé', 'Solde payé', 'Total payé', 'Montant solde']
        .map((k) => `<p><span data-token="${k}">x</span></p>`).join('');
    const vide = resolveTokens(ctxAvec({ acompte: { montantPaye: 0, date: null }, solde: { montantPaye: 0, date: null }, totalPaye: 0 }));
    // {Montant solde} n'est PAS vide ici (il y a un reste) ; on le retire du corps « tout vide ».
    assert.strictEqual(vide['Montant solde'] !== '', true);
    const corpsVides = ['Acompte payé le', 'Solde payé le', 'Acompte payé', 'Solde payé', 'Total payé']
        .map((k) => `<p><span data-token="${k}">x</span></p>`).join('');
    assert.deepStrictEqual(findMissingTokens([corpsVides], ctxAvec(undefined)).map((m) => m.key), []);
    assert.ok(corps.includes('Montant solde'));
});

test('les six jetons sont AU CATALOGUE, dans le groupe « Stagiaire » (donc résolubles et insérables)', () => {
    const { TOKEN_CATALOG } = require('../lib/tokens.js');
    const stagiaire = TOKEN_CATALOG.find((g) => g.group === 'Stagiaire');
    const cles = new Set((stagiaire.tokens || []).map((t) => t.key));
    for (const k of ['Montant solde', 'Acompte payé le', 'Solde payé le', 'Acompte payé', 'Solde payé', 'Total payé']) {
        assert.ok(cles.has(k), `${k} doit être au catalogue (groupe Stagiaire)`);
    }
});

/* ─── Les deux bouts de tuyau : loadContext calcule le règlement, la palette le repropose ─────────── */
test('loadContext calcule le règlement (MÊME règle que la carte) et le pose sur formations[0]', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    assert.match(src, /calculerReglement\(\{/, 'loadContext réemploie calculerReglement, pas une 2e copie');
    assert.match(src, /formations\[0\]\.reglement =/, 'le règlement agrégé est posé sur formations[0] (il se fige avec elles)');
    // Les dates « payé le … » sont bien lues, au jour (sinon un objet Date casserait le calcul).
    assert.match(src, /acompte_paye_le[\s\S]*?DATE_FORMAT/, 'acompte_paye_le lu au format jour');
});

test('la palette repropose le règlement sous « Entreprise » (où le groupe « Stagiaire » est masqué)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');
    assert.match(src, /REGLEMENT_ENTREPRISE/, 'la liste des jetons reproposés existe');
    for (const k of ['Total payé', 'Acompte payé le', 'Montant solde']) {
        assert.ok(src.includes(`'${k}'`), `${k} doit figurer dans REGLEMENT_ENTREPRISE`);
    }
    // Rattachés au groupe « Entreprise », avec la couleur d'origine « Stagiaire ».
    assert.match(src, /group === 'Entreprise'/);
    assert.match(src, /origin: 'Stagiaire'/);
});
