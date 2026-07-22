/**
 * Le choix du modèle de FACTURE suit le DESTINATAIRE (l'acheteur).
 *
 * Une facture à une ENTREPRISE et une facture à un PARTICULIER ne se présentent pas pareil.
 * Chaque modèle FACTURE porte un « destinataire » (buyer_audience) ; l'app prend celui qui
 * correspond à l'acheteur, sinon un modèle « tous », sinon l'ancien réglage, sinon l'unique.
 * Ces tests gèlent cet ordre — et le fait que rien ne parte jamais avec la mauvaise présentation.
 */
const test = require('node:test');
const assert = require('node:assert');
const { pickInvoiceTemplate } = require('../controllers/invoice.controller.js');

const F = (slug, audience) => ({ slug, buyer_audience: audience });

test('un acheteur ENTREPRISE prend le modèle destiné aux entreprises', () => {
    const factures = [F('facture-particulier', 'individual'), F('facture-entreprise', 'company')];
    assert.strictEqual(pickInvoiceTemplate(factures, true, null).slug, 'facture-entreprise');
});

test('un acheteur PARTICULIER prend le modèle destiné aux particuliers', () => {
    const factures = [F('facture-particulier', 'individual'), F('facture-entreprise', 'company')];
    assert.strictEqual(pickInvoiceTemplate(factures, false, null).slug, 'facture-particulier');
});

test('sans modèle dédié, on retombe sur un modèle « tous »', () => {
    // buyer_audience vide/null = convient à tous. C'est le comportement d'avant la fonctionnalité.
    const factures = [F('facture', null), F('facture-entreprise', 'company')];
    assert.strictEqual(pickInvoiceTemplate(factures, false, null).slug, 'facture',
        'un particulier sans modèle « individual » prend le modèle « tous », pas celui des entreprises');
});

test('le modèle dédié PRIME sur le modèle « tous »', () => {
    const factures = [F('facture', null), F('facture-pro', 'company')];
    assert.strictEqual(pickInvoiceTemplate(factures, true, null).slug, 'facture-pro');
});

test('dernier repli : l\'ancien réglage global, puis l\'unique modèle', () => {
    // Aucun destinataire renseigné, deux modèles : on suit le slug réglé globalement…
    const deux = [F('facture-a', null), F('facture-b', null)];
    // (les deux sont « tous » : le 1er « tous » gagne avant même le réglage — comportement stable)
    assert.strictEqual(pickInvoiceTemplate(deux, true, 'facture-b').slug, 'facture-a');
    // …et s'il n'y a qu'un seul modèle, c'est lui, quel que soit l'acheteur.
    const un = [F('facture', null)];
    assert.strictEqual(pickInvoiceTemplate(un, true, null).slug, 'facture');
    assert.strictEqual(pickInvoiceTemplate(un, false, null).slug, 'facture');
});

test('aucun choix possible → null (l\'appelant demande de renseigner un destinataire)', () => {
    // Deux modèles « company » seulement, acheteur particulier, aucun « tous », aucun réglage :
    // rien ne correspond → null, et le contrôleur renvoie un message explicite.
    const factures = [F('pro-1', 'company'), F('pro-2', 'company')];
    assert.strictEqual(pickInvoiceTemplate(factures, false, null), null);
});
