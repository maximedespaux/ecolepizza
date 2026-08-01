/**
 * Les infos de l'ACHETEUR sur une facture passent par les « Champs documents ».
 *
 * Plutôt qu'une liste figée de jetons acheteur (nom / adresse / SIRET), la facture expose TOUTE
 * la fiche de l'acheteur comme jetons field:… de son groupe : field:company.* si c'est une
 * entreprise, field:learner.* si c'est un stagiaire. L'organisme coche le champ voulu (e-mail,
 * téléphone…) dans « Champs documents » et l'insère ; il se remplit alors avec la valeur de
 * l'acheteur. Ces tests gèlent ce câblage — et le fait que les colonnes sensibles n'y passent PAS.
 */
const test = require('node:test');
const assert = require('node:assert');
const { invoiceCtx } = require('../controllers/invoice.controller.js');
const { fillHtml } = require('../lib/htmlfill.js');

const ORG = { legal_name: 'ECOLE PIZZA', siret: '123' };

test('acheteur ENTREPRISE : ses colonnes deviennent des jetons field:company.*', () => {
    const data = {
        number: 'F1', typeLabel: 'Facture', issueDate: '20260722',
        buyer: { name: 'Napoli SARL', siret: '999', email: 'co@napoli.fr', address: { line: '5 av', zip: '33000', city: 'Bx' } },
        buyerFields: { prefix: 'company', row: { name: 'Napoli SARL', email: 'co@napoli.fr', phone: '0555000111', naf_ape: '5610C' } },
        lines: [{ name: 'Farine', amount: 36, taxRate: 20 }],
    };
    const ctx = invoiceCtx(ORG, data);
    assert.strictEqual(ctx.fields['company.phone'], '0555000111');
    assert.strictEqual(ctx.fields['company.email'], 'co@napoli.fr');
    assert.strictEqual(ctx.fields['company.naf_ape'], '5610C');
    // La puce (Champs documents) se remplit à la valeur de l'acheteur.
    const out = fillHtml('<span data-token="field:company.phone">Tél</span>', ctx);
    assert.match(out, /0555000111/);
});

test('acheteur STAGIAIRE : ses colonnes deviennent des jetons field:learner.*', () => {
    const data = {
        number: 'F2', typeLabel: 'Facture', issueDate: '20260722',
        buyer: { name: 'Jean D', siret: null, email: 'j@d.fr', address: {} },
        buyerFields: { prefix: 'learner', row: { first_name: 'Jean', last_name: 'Dupont', email: 'j@d.fr', phone: '0611', opco: 'AKTO' } },
        lines: [{ name: 'x', amount: 10 }],
    };
    const ctx = invoiceCtx(ORG, data);
    assert.strictEqual(ctx.fields['learner.phone'], '0611');
    assert.strictEqual(ctx.fields['learner.opco'], 'AKTO');
    assert.strictEqual(ctx.fields['learner.email'], 'j@d.fr');
});

test('les colonnes techniques / sensibles ne deviennent JAMAIS des jetons', () => {
    // Une fiche peut porter un identifiant, une image de signature, un numéro de sécu… : rien de
    // tout cela ne doit fuiter dans un jeton insérable sur une facture.
    const data = {
        number: 'F3', typeLabel: 'Facture', issueDate: '20260722',
        buyer: { name: 'X', siret: null, email: null, address: {} },
        buyerFields: { prefix: 'company', row: {
            id: 'uuid', organization_id: 'org', name: 'X', social_security: 'SECRET',
            signature_image: 'BLOB', email_enc: 'CHIFFRE', lat: '43.1', lng: '0.2',
        } },
        lines: [{ name: 'x', amount: 10 }],
    };
    const ctx = invoiceCtx(ORG, data);
    for (const k of ['company.id', 'company.organization_id', 'company.social_security',
        'company.signature_image', 'company.email_enc', 'company.lat', 'company.lng']) {
        assert.ok(!(k in ctx.fields), `${k} ne doit pas être exposé comme jeton`);
    }
    assert.strictEqual(ctx.fields['company.name'], 'X', 'les champs normaux, eux, restent exposés');
});

test('sans acheteur détaillé (nom libre), aucun jeton field: d\'acheteur — mais pas d\'erreur', () => {
    const data = {
        number: 'F4', typeLabel: 'Facture', issueDate: '20260722',
        buyer: { name: 'Comptoir', siret: null, email: null, address: {} },
        buyerFields: null, lines: [{ name: 'x', amount: 10 }],
    };
    const ctx = invoiceCtx(ORG, data);
    assert.ok(!Object.keys(ctx.fields).some((k) => k.startsWith('company.') || k.startsWith('learner.')));
});
