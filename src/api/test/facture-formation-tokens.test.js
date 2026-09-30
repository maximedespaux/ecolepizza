/**
 * LA FACTURE DE FORMATION NARRATIVE (demandée le 2026-09-30, à partir du document Word de l'école) :
 * « Du lundi 18 mai au vendredi 22 mai 2026 soit 44 heures … au coût unitaire de 40,45 € par heure,
 * MONTANT NET 1780 € », avec l'ACOMPTE et le RESTE À PAYER.
 *
 * CE QUE ÇA A DEMANDÉ. Une facture n'exposait que l'acheteur, l'organisme, les lignes et les totaux.
 * Les jetons de FORMATION, les DATES et l'ACOMPTE sortaient vides sur une facture (`formations: []`
 * dans invoiceCtx), et le coût horaire n'avait aucun jeton. On ajoute :
 *   · dans `invoiceCtx`, la formation du dossier facturé → Champs documents (field:training_program.*,
 *     field:training_session.*) ET `formations[0]` (d'où {Formation}, {Heures}, {Jour1}, {Acompte},
 *     {Reste à payer}…) ; le prix de référence = le TOTAL de la facture, pas le tarif catalogue ;
 *   · le jeton {Coût horaire} (= montant ÷ heures) ;
 *   · les dates EN TOUTES LETTRES ({Début/Fin en toutes lettres}).
 *
 * Ces tests éprouvent la RÉSOLUTION des jetons (le PDF, lui, se vérifie sur l'instance déployée :
 * LibreOffice n'est pas ici). Réintroduire `formations: []` dans invoiceCtx, ou retirer un des
 * jetons, fait rougir.
 */
const test = require('node:test');
const assert = require('node:assert');
const { resolveTokens, frDateLong, findMissingTokens } = require('../lib/tokens.js');
const { invoiceCtx } = require('../controllers/invoice.controller.js');

// `euro` sépare les milliers par une espace insécable fine : on normalise pour comparer la VALEUR.
const eur = (s) => String(s).replace(/\s/g, ' ');

const FORMATION = {
    title: 'Pizzaïolo Niveau I', code: 'RS7404', hours: 44, days: 5, price: 1780,
    start_date: '2026-05-18', end_date: '2026-05-22', week: 21, year: 2026, trainer: null,
    acompte: 450, enroll_price: null, civility: 'Monsieur', first_name: 'Anthony', last_name: 'MUNOZ',
};
// Facture d'entreprise (SARL, avec SIRET) « pour le compte » du stagiaire MUNOZ, 1780 € exonérés.
const dataFacture = (extra = {}) => ({
    number: 'FACT-2026-0007', typeLabel: 'Facture', issueDate: '20260522', dueDate: null,
    amountNet: 1780, tvaExoneree: true, lines: [{ name: 'Formation', amount: 1780 }],
    buyer: { name: 'SARL LE PETIT MITRON', siret: '12345678900012', address: { line: '7 rue Joseph Boué', zip: '09140', city: 'OUST' } },
    buyerFields: null, formation: FORMATION, ...extra,
});
const ORG = { legal_name: 'École Pizza', town: 'Lannemezan', zip_code: '65300', siret: '87995513600012', naf_ape: '8559', nda: '76650098965' };

test('UNE DATE EN TOUTES LETTRES : « lundi 18 mai 2026 », en minuscules, sans décalage de fuseau', () => {
    assert.strictEqual(frDateLong('2026-05-18'), 'lundi 18 mai 2026');
    assert.strictEqual(frDateLong('2026-05-22'), 'vendredi 22 mai 2026');
    // AAAA-MM-JJ lu en date LOCALE : `new Date("2026-01-01")` serait la veille en fuseau négatif.
    assert.strictEqual(frDateLong('2026-01-01'), 'jeudi 1 janvier 2026');
    assert.strictEqual(frDateLong(''), '');
});

test('LES JETONS FORMATION SE REMPLISSENT : intitulé, heures, dates, coût horaire, acompte, reste', () => {
    const ctx = { org: ORG, formations: [{ title: 'Pizzaïolo Niveau I', hours: 44, enroll_price: 1780, price: 1780, acompte: 450, start_date: '2026-05-18', end_date: '2026-05-22' }], invoice: { number: 'F1' } };
    const t = resolveTokens(ctx);
    assert.strictEqual(t.Formation, 'Pizzaïolo Niveau I');
    assert.strictEqual(t.Heures, '44');
    assert.strictEqual(t.Jour1, '18/05/2026');
    assert.strictEqual(t['Début en toutes lettres'], 'lundi 18 mai 2026');
    assert.strictEqual(t['Fin en toutes lettres'], 'vendredi 22 mai 2026');
    assert.strictEqual(eur(t['Coût horaire']), '40,45 €', '1780 ÷ 44 arrondi au centime');
    assert.strictEqual(eur(t.Acompte), '450 €');
    assert.strictEqual(eur(t['Reste à payer']), '1 330 €', '1780 − 450');
});

test('invoiceCtx : la formation du dossier alimente Champs documents, formations[0] et « pour le compte »', () => {
    const ctx = invoiceCtx(ORG, dataFacture());
    assert.strictEqual(ctx.fields['training_program.title'], 'Pizzaïolo Niveau I');
    assert.strictEqual(ctx.fields['training_program.hours'], 44);
    assert.strictEqual(ctx.fields['training_session.start_date'], '2026-05-18');
    // Le prix de référence de formations[0] = le TOTAL de la facture (1780), pas le tarif catalogue.
    assert.strictEqual(ctx.formations.length, 1);
    assert.strictEqual(ctx.formations[0].enroll_price, 1780);
    assert.strictEqual(ctx.formations[0].acompte, 450);
    // « Pour le compte de » nomme le STAGIAIRE même si l'acheteur est l'ENTREPRISE.
    assert.strictEqual(ctx.learner.last_name, 'MUNOZ');
    assert.strictEqual(ctx.company.name, 'SARL LE PETIT MITRON');
    const t = resolveTokens(ctx);
    assert.strictEqual(t.Personne, 'Monsieur Anthony MUNOZ');
    assert.strictEqual(t['Nom entreprise'], 'SARL LE PETIT MITRON');
    assert.strictEqual(eur(t['Coût horaire']), '40,45 €');
    assert.strictEqual(eur(t['Reste à payer']), '1 330 €');
});

test('SANS formation (vente boutique) : rien n\'est ajouté — les factures existantes ne changent pas', () => {
    const ctx = invoiceCtx(ORG, dataFacture({ formation: null, buyer: { name: 'Client', siret: null, address: {} }, amountNet: 30, lines: [{ name: 'Article', amount: 30 }] }));
    assert.deepStrictEqual(ctx.formations, []);
    assert.ok(!('training_program.title' in ctx.fields), 'aucun champ de formation ajouté');
    const t = resolveTokens(ctx);
    assert.strictEqual(t.Formation, '');
    assert.strictEqual(t['Coût horaire'], '');
});

test('LA FACTURE NE BLOQUE PAS : les jetons narratifs sont remplis quand la formation est là', () => {
    const ctx = invoiceCtx(ORG, dataFacture());
    const corps = '<p>{Formation} {Heures} {Coût horaire} {Acompte} {Reste à payer} '
        + '{Début en toutes lettres} {Fin en toutes lettres} {Total HT} {Numéro facture} {Personne}</p>';
    const manquants = findMissingTokens([corps], ctx).map((m) => m.key);
    assert.deepStrictEqual(manquants, [], `aucun jeton attendu ne sort vide : ${manquants.join(', ')}`);
});
