/**
 * Conformité française du XML Factur-X — XP Z12-012, règles BR-FR.
 *
 * POURQUOI CES TESTS EXISTENT. Une facture peut être PARFAITE À L'ŒIL et rejetée quand même :
 * ce n'est pas le PDF que lit une plateforme, c'est le XML embarqué. Les six erreurs corrigées
 * ici portaient toutes sur des mentions qui figuraient DÉJÀ en toutes lettres sur le document
 * imprimé — elles manquaient seulement là où ça compte.
 *
 * Un rejet ne se voit pas à l'émission. Il revient des jours plus tard, par la plateforme, loin
 * de l'écran où on peut le corriger. D'où des tests : c'est le seul endroit où l'on peut
 * constater tout de suite qu'une règle est de nouveau violée.
 */
const test = require('node:test');
const assert = require('node:assert');
const { buildCII, siren, manquantsFacturX } = require('../lib/facturx.js');

/** Une facture complète, telle que loadInvoiceData la produit. */
const FACTURE = () => ({
    number: 'F-2026-0014', type: 'FACTURE', issueDate: '20260721', dueDate: '20260820',
    amountNet: 200, tvaExoneree: false, taxRate: null,
    lines: [{ name: 'Farine T65', amount: 100, taxRate: 5.5 }, { name: 'Pelle', amount: 100, taxRate: 20 }],
    seller: {
        name: 'Impasto Formation', siret: '879 955 136 00012', vat: 'FR12879955136',
        email: 'contact@impasto.fr', address: { line: '12 rue des Fours', zip: '75011', city: 'Paris' },
    },
    buyer: {
        name: 'Pizzeria Bella', siret: '12345678900011', email: 'compta@bella.fr',
        address: { line: '3 av. Gambetta', zip: '69003', city: 'Lyon' },
    },
});

// --- BR-FR-05 / BT-22 : les trois mentions obligatoires -------------------------------------

test('BR-FR-05 : les trois mentions légales sont dans les notes du XML', () => {
    // Elles étaient sur le PDF, pas dans le XML. Trois rejets sur une facture complète à l'œil.
    const xml = buildCII(FACTURE());
    for (const code of ['PMD', 'PMT', 'AAB']) {
        assert.match(xml, new RegExp(`<ram:SubjectCode>${code}</ram:SubjectCode>`), `note ${code} absente`);
    }
});

test('BR-FR-05 : chaque note porte un texte, pas seulement son code', () => {
    // Un code sans contenu passerait la présence et ne dirait rien au lecteur.
    const xml = buildCII(FACTURE());
    const notes = [...xml.matchAll(/<ram:IncludedNote>\s*<ram:Content>([\s\S]*?)<\/ram:Content>\s*<ram:SubjectCode>(\w+)<\/ram:SubjectCode>/g)];
    assert.strictEqual(notes.length, 3);
    for (const [, contenu, code] of notes) {
        assert.ok(contenu.trim().length > 30, `${code} : contenu trop court pour être une mention`);
    }
    assert.match(xml, /trois fois le taux de l'intérêt légal/, 'pénalités de retard (PMD)');
    assert.match(xml, /indemnité forfaitaire[\s\S]{0,40}40 euros/, 'frais de recouvrement (PMT)');
    assert.match(xml, /escompte/, 'escompte (AAB)');
});

test('BR-FR-06 : aucun code de mention n\'apparaît deux fois', () => {
    const xml = buildCII(FACTURE());
    for (const code of ['PMD', 'PMT', 'AAB']) {
        const n = (xml.match(new RegExp(`<ram:SubjectCode>${code}</ram:SubjectCode>`, 'g')) || []).length;
        assert.strictEqual(n, 1, `${code} apparaît ${n} fois`);
    }
});

// --- BR-FR-10 / BT-30 : SIREN, pas SIRET ----------------------------------------------------

test('BR-FR-10 : BT-30 porte le SIREN, neuf chiffres', () => {
    // Le SIRET complet y était écrit. Le validateur : « doit être composé exactement de 9
    // chiffres. Valeur actuelle : "87995513600012" ». Les deux ne désignent pas la même chose —
    // le SIREN identifie l'ENTREPRISE, le SIRET l'un de ses ÉTABLISSEMENTS.
    const xml = buildCII(FACTURE());
    const bt30 = [...xml.matchAll(/<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">(\d*)<\/ram:ID>/g)];
    assert.strictEqual(bt30.length, 2, 'vendeur et acheteur');
    for (const [, val] of bt30) {
        assert.strictEqual(val.length, 9, `BT-30 = "${val}" : ${val.length} chiffres au lieu de 9`);
    }
});

test('le SIRET n\'est pas perdu : il part en BT-29', () => {
    // Le corriger en tronquant aurait fait disparaître l'établissement de la facture.
    const xml = buildCII(FACTURE());
    assert.match(xml, /<ram:ID schemeID="0009">87995513600012<\/ram:ID>/);
    assert.match(xml, /<ram:ID schemeID="0009">12345678900011<\/ram:ID>/);
});

test('un SIRET mal saisi n\'est pas tronqué en silence', () => {
    // Rendre 9 chiffres à partir de n'importe quoi produirait un identifiant PLAUSIBLE mais
    // faux — le pire résultat possible pour une donnée d'identification. On laisse passer tel
    // quel et le validateur le dira.
    assert.strictEqual(siren('879 955 136 00012'), '879955136', 'SIRET à 14 chiffres');
    assert.strictEqual(siren('879955136'), '879955136', 'SIREN déjà seul');
    assert.strictEqual(siren('1234'), '1234', 'saisie douteuse : rendue intacte');
    assert.strictEqual(siren(null), '');
});

// --- BR-FR-12 / BT-49 et BR-FR-13 / BT-34 : adresses électroniques ---------------------------

test('BR-FR-13 : l\'adresse électronique du vendeur est déclarée', () => {
    const xml = buildCII(FACTURE());
    const bloc = xml.slice(xml.indexOf('<ram:SellerTradeParty>'), xml.indexOf('</ram:SellerTradeParty>'));
    assert.match(bloc, /<ram:URIUniversalCommunication><ram:URIID schemeID="EM">contact@impasto\.fr<\/ram:URIID>/);
});

test('BR-FR-12 : l\'adresse électronique de l\'acheteur est déclarée', () => {
    const xml = buildCII(FACTURE());
    const bloc = xml.slice(xml.indexOf('<ram:BuyerTradeParty>'), xml.indexOf('</ram:BuyerTradeParty>'));
    assert.match(bloc, /<ram:URIUniversalCommunication><ram:URIID schemeID="EM">compta@bella\.fr<\/ram:URIID>/);
});

test('une adresse électronique absente n\'est pas remplacée par une valeur de secours', () => {
    // Une adresse inventée ferait passer la validation en désignant un destinataire qui
    // n'existe pas : le rejet se déplacerait du validateur vers un client qui ne reçoit rien,
    // et bien plus tard. Mieux vaut échouer là où ça se corrige.
    const d = FACTURE();
    d.buyer.email = null;
    const xml = buildCII(d);
    const bloc = xml.slice(xml.indexOf('<ram:BuyerTradeParty>'), xml.indexOf('</ram:BuyerTradeParty>'));
    assert.doesNotMatch(bloc, /URIUniversalCommunication/);
    // …mais on ne se tait pas pour autant.
    assert.deepStrictEqual(manquantsFacturX(d), ["l'adresse e-mail du client de cette facture"]);
});

test('une facture complète ne signale rien à corriger', () => {
    assert.deepStrictEqual(manquantsFacturX(FACTURE()), []);
});

// --- L'ordre des éléments, que le XSD impose ------------------------------------------------

test('les parties respectent la séquence imposée par le schéma CII', () => {
    // Le XSD CII est une SÉQUENCE : un élément correct placé au mauvais endroit invalide le
    // document entier. Poser l'adresse électronique après la déclaration de TVA aurait produit
    // exactement le même XML à la lecture humaine, et un rejet à la validation.
    const xml = buildCII(FACTURE());
    const bloc = xml.slice(xml.indexOf('<ram:SellerTradeParty>'), xml.indexOf('</ram:SellerTradeParty>'));
    const rang = (t) => bloc.indexOf(t);
    const attendu = ['<ram:ID ', '<ram:Name>', '<ram:SpecifiedLegalOrganization>', '<ram:PostalTradeAddress>',
        '<ram:URIUniversalCommunication>', '<ram:SpecifiedTaxRegistration>'];
    const positions = attendu.map(rang);
    for (const [i, p] of positions.entries()) assert.ok(p >= 0, `${attendu[i]} absent`);
    assert.deepStrictEqual(positions, [...positions].sort((a, b) => a - b), 'séquence CII non respectée');
});

test('les notes se placent après la date d\'émission, dans ExchangedDocument', () => {
    const xml = buildCII(FACTURE());
    const doc = xml.slice(xml.indexOf('<rsm:ExchangedDocument>'), xml.indexOf('</rsm:ExchangedDocument>'));
    assert.ok(doc.indexOf('<ram:IssueDateTime>') < doc.indexOf('<ram:IncludedNote>'),
        'les notes doivent suivre la date d\'émission');
});

test('le XML reste bien formé quelles que soient les données', () => {
    // Une apostrophe ou une esperluette dans une raison sociale casserait le document. On le
    // vérifie sur des valeurs volontairement hostiles.
    const d = FACTURE();
    d.seller.name = 'Four & Cie « L\'Artisan »';
    d.buyer.name = '<Pizzeria> "Bella" & Fils';
    d.lines[0].name = 'Farine T65 <bio> & levain';
    const xml = buildCII(d);
    assert.match(xml, /Four &amp; Cie/);
    assert.match(xml, /&lt;Pizzeria&gt; &quot;Bella&quot; &amp; Fils/);

    // Le vrai critère : hors des balises, il ne doit rester ni chevron, ni esperluette nue.
    // Une première version de ce test cherchait le contraire à coups d'expression régulière et
    // se trompait elle-même — le XML était bon, l'assertion fausse. On enlève donc les balises
    // et on regarde ce qui reste, ce qui ne peut pas se retourner.
    const texte = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<[^>]*>/g, '');
    assert.doesNotMatch(texte, /[<>]/, 'chevron non échappé dans le texte');
    assert.doesNotMatch(texte, /&(?!amp;|lt;|gt;|quot;|apos;)/, 'esperluette non échappée');
});
