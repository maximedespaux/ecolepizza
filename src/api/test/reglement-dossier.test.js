/**
 * LE RÈGLEMENT D'UN DOSSIER (carte « Règlement » de la fiche stagiaire, demandée le 2026-09-30) —
 * acompte payé ? solde payé ? en logique HYBRIDE : la facture d'abord, la coche manuelle sinon.
 *
 * Chaque test gèle une règle qui a une raison d'être :
 *   · sans facture, c'est la coche qui décide, et le montant de l'acompte est celui qu'on a saisi ;
 *   · dès qu'une facture porte la ligne, c'est ELLE qui fait foi (paiement lu dans `payment`) ;
 *   · le reste = prix − acompte, comme le jeton {Reste à payer} ;
 *   · on compte en CENTIMES : un solde exactement couvert est payé, pas « presque ».
 */
const test = require('node:test');
const assert = require('node:assert');
const { calculerReglement } = require('../lib/reglementDossier.js');

test('SANS FACTURE : la coche manuelle décide, le montant de l\'acompte est celui saisi', () => {
    const r = calculerReglement({ prix: 1500, acompteConvenu: 450, acomptePayeLe: '2026-03-12', soldePayeLe: null, factures: [] });
    assert.strictEqual(r.acompte.montant, 450);
    assert.strictEqual(r.acompte.paye, true);
    assert.strictEqual(r.acompte.source, 'manuel');
    assert.strictEqual(r.acompte.date, '2026-03-12');
    assert.strictEqual(r.acompte.saisissable, true, 'sans facture, la ligne reste saisissable à la main');
    assert.strictEqual(r.reste, 1050);
    assert.strictEqual(r.solde.montant, 1050);
    assert.strictEqual(r.solde.paye, false, 'le solde n\'est pas coché : il reste dû');
    assert.strictEqual(r.solde.source, null);
});

test('UN ACOMPTE FACTURÉ ET PAYÉ : la facture fait foi (montant, date, source)', () => {
    const r = calculerReglement({
        prix: 1500, acompteConvenu: 999 /* ignoré : une facture d'acompte existe */, acomptePayeLe: null,
        factures: [{ type: 'ACOMPTE', numero: 'ACPT-2026-0007', montant: 450, paye: 450, dernier_paiement: '2026-03-12 09:30:00', statut: 'PAYEE' }],
    });
    assert.strictEqual(r.acompte.montant, 450, 'le montant vient de la facture, pas du convenu');
    assert.strictEqual(r.acompte.paye, true);
    assert.strictEqual(r.acompte.source, 'facture');
    assert.strictEqual(r.acompte.date, '2026-03-12');
    assert.strictEqual(r.acompte.saisissable, false, 'une facture porte la ligne : pas de coche manuelle');
    assert.strictEqual(r.reste, 1050);
});

test('ACOMPTE FACTURÉ MAIS PAS ENCORE ENCAISSÉ : ni payé, mais le déjà-versé se voit', () => {
    const r = calculerReglement({
        prix: 1500, factures: [{ type: 'ACOMPTE', numero: 'ACPT-1', montant: 450, paye: 200, dernier_paiement: '2026-03-12 09:30:00', statut: 'IMPAYEE' }],
    });
    assert.strictEqual(r.acompte.paye, false);
    assert.strictEqual(r.acompte.source, null);
    assert.strictEqual(r.acompte.date, null);
    assert.strictEqual(r.acompte.montantPaye, 200, 'le partiel encaissé reste lisible');
});

test('UNE FACTURE DE SOLDE PAYÉE : le solde est payé, d\'après la facture', () => {
    const r = calculerReglement({
        prix: 1500,
        factures: [
            { type: 'ACOMPTE', numero: 'A', montant: 450, paye: 450, dernier_paiement: '2026-03-12 10:00:00', statut: 'PAYEE' },
            { type: 'FACTURE', numero: 'F', montant: 1050, paye: 1050, dernier_paiement: '2026-06-01 14:00:00', statut: 'PAYEE' },
        ],
    });
    assert.strictEqual(r.acompte.paye, true);
    assert.strictEqual(r.solde.paye, true);
    assert.strictEqual(r.solde.source, 'facture');
    assert.strictEqual(r.solde.date, '2026-06-01');
});

test('TOUT LE PRIX ENCAISSÉ (une seule facture) : le solde est couvert même sans facture de solde', () => {
    const r = calculerReglement({
        prix: 1500, factures: [{ type: 'FACTURE', numero: 'F', montant: 1500, paye: 1500, dernier_paiement: '2026-06-01 00:00:00', statut: 'PAYEE' }],
    });
    assert.strictEqual(r.solde.paye, true, 'tout le prix est encaissé');
    // Pas d'acompte facturé ni convenu : montant nul, reste = prix.
    assert.strictEqual(r.acompte.montant, null);
    assert.strictEqual(r.reste, 1500);
});

test('EN CENTIMES : une facture de solde couverte au centime est payée ; un centime en moins ne l\'est pas', () => {
    const base = { prix: 1500, acompteConvenu: 450 }; // reste = 1050
    const paye = calculerReglement({ ...base, factures: [{ type: 'FACTURE', numero: 'F', montant: 1050, paye: 1050, dernier_paiement: '2026-06-01', statut: 'EMISE' }] });
    assert.strictEqual(paye.solde.paye, true);
    const presque = calculerReglement({ ...base, factures: [{ type: 'FACTURE', numero: 'F', montant: 1050, paye: 1049.99, dernier_paiement: '2026-06-01', statut: 'EMISE' }] });
    assert.strictEqual(presque.solde.paye, false, 'un centime manquant n\'est pas « presque payé »');
});

test('LE MOYEN DE PAIEMENT (migration 195) traverse le calcul sans rien y changer', () => {
    // Séparément acompte / solde : un acompte par chèque, un solde par virement.
    const r = calculerReglement({
        prix: 1500, acompteConvenu: 450, acomptePayeLe: '2026-03-12',
        acompteMoyen: 'CHEQUE', acompteRef: '12345', soldeMoyen: 'VIREMENT', soldeRef: 'VIR-2026-07', factures: [],
    });
    assert.strictEqual(r.acompte.moyen, 'CHEQUE');
    assert.strictEqual(r.acompte.ref, '12345');
    assert.strictEqual(r.solde.moyen, 'VIREMENT');
    assert.strictEqual(r.solde.ref, 'VIR-2026-07');
    // Passif : le montant et l'état ne bougent pas d'un moyen noté.
    assert.strictEqual(r.acompte.paye, true);
    assert.strictEqual(r.reste, 1050);
});

test('SANS MOYEN : les champs valent null (pas undefined), même forme partout', () => {
    const r = calculerReglement({ prix: 1500, acompteConvenu: 450 });
    assert.strictEqual(r.acompte.moyen, null);
    assert.strictEqual(r.acompte.ref, null);
    assert.strictEqual(r.solde.moyen, null);
    assert.strictEqual(r.solde.ref, null);
});

test('UNE FACTURE ANNULÉE ne compte pour rien', () => {
    const r = calculerReglement({
        prix: 1500, acompteConvenu: 450, acomptePayeLe: '2026-03-12',
        factures: [{ type: 'ACOMPTE', numero: 'A', montant: 450, paye: 450, dernier_paiement: '2026-03-12', statut: 'ANNULEE' }],
    });
    // L'annulée est ignorée : on retombe sur le convenu + la coche manuelle.
    assert.strictEqual(r.acompte.source, 'manuel');
    assert.strictEqual(r.acompte.montant, 450);
    assert.strictEqual(r.factures.length, 0, 'l\'annulée ne figure pas dans les factures rendues');
});
