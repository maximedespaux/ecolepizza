/**
 * L'ATTESTATION DE SIGNATURE — le dossier de preuve d'un document signé (demandé le 2026-10-04).
 *
 * Les signatures de l'application sont AVANCÉES (PAdES, SHA-256) mais non qualifiées : leur valeur
 * probante tient au FAISCEAU DE PREUVES (qui, quand, depuis quelle IP, quel appareil, sur quelle
 * empreinte), déjà consigné à chaque signature mais qui dormait en base. L'attestation le met noir
 * sur blanc, dans un PDF scellé, présentable lors d'un contrôle (Qualiopi, OPCO) ou d'un litige.
 *
 * CES TESTS GÈLENT : la mise en forme (lib pure, chaque preuve présente et ÉCHAPPÉE), et le câblage
 * (route + contrôleur + écran), lu au source comme ailleurs dans ce dépôt.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { construireAttestationHtml } = require('../lib/attestationSignature.js');

const BASE = {
    org: { legal_name: 'ECOLE PIZZAIOLO', address: '1 rue du Four', zip_code: '65300', town: 'LANNEMEZAN', siret: '12345678900012', email: 'contact@ecole-pizza.com' },
    doc: { id: 'doc-1', title: 'Contrat de formation', type_label: 'Contrat de formation', sent_at: '18/05/2026', empreinte: 'a'.repeat(64) },
    signataires: [
        { role: 'Stagiaire', nom: 'Marcel HERRERO', compte: 'marcel@example.com', date: '04/10/2026 à 09h37', ip: '82.65.12.9', appareil: 'Mozilla/5.0 (Macintosh)' },
        { role: 'Organisme', nom: 'ECOLE PIZZAIOLO Jean-Jacques DESPAUX', compte: null, date: '04/10/2026 à 09h37', ip: null, appareil: 'Contreseing automatique de l\'organisme (serveur)' },
    ],
    genereLe: '04/10/2026 à 16h01',
};

test('l\'attestation porte le document, son empreinte, et chaque preuve de chaque signataire', () => {
    const h = construireAttestationHtml(BASE);
    assert.match(h, /Attestation de signature électronique/);
    assert.match(h, /ECOLE PIZZAIOLO/);
    assert.match(h, /Contrat de formation/);
    assert.match(h, /doc-1/, 'la référence du document');
    assert.match(h, new RegExp('a{64}'), 'l\'empreinte SHA-256 du contenu');
    // Le faisceau de preuves, signataire par signataire.
    assert.match(h, /Marcel HERRERO/);
    assert.match(h, /marcel@example\.com/);
    assert.match(h, /82\.65\.12\.9/);
    assert.match(h, /Mozilla\/5\.0 \(Macintosh\)/);
    assert.match(h, /04\/10\/2026 à 09h37/);
    assert.match(h, /Contreseing automatique de l'organisme/);
    assert.match(h, /Signataires \(2\)/, 'le nombre de signataires');
    assert.match(h, /signatures? électroniques? avancées?/, 'la nature de la signature est explicitée');
});

test('tout est ÉCHAPPÉ : un nom piégé ne peut pas injecter de HTML', () => {
    const h = construireAttestationHtml({
        ...BASE,
        signataires: [{ role: 'Stagiaire', nom: '<script>alert(1)</script>', compte: null, date: 'x', ip: 'y', appareil: 'z' }],
    });
    assert.doesNotMatch(h, /<script>alert/);
    assert.match(h, /&lt;script&gt;/);
});

test('une valeur absente s\'imprime « — », jamais « null »', () => {
    const h = construireAttestationHtml({
        ...BASE,
        signataires: [{ role: 'Stagiaire', nom: 'X', compte: null, date: null, ip: null, appareil: null }],
    });
    assert.doesNotMatch(h, /null/);
    assert.match(h, /—/);
});

/* LE CÂBLAGE, lu au source. */
test('la route /:id/preuve et le contrôleur downloadProof existent', () => {
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'document.routes.js'), 'utf8');
    assert.match(routes, /router\.get\('\/:id\/preuve', authenticateToken, downloadProof\)/);
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
    assert.match(ctrl, /const downloadProof = async \(req, res\)/);
    // Les trois sources de signataires (principale, cadres à part, contreseing organisme).
    assert.match(ctrl, /async function collecterSignataires/);
    assert.match(ctrl, /FROM document_signature WHERE document_id = \? AND signed_at IS NOT NULL/);
    assert.match(ctrl, /org_signed_at_fr/);
    // L'attestation est scellée, et seulement servie pour un document réellement signé.
    assert.match(ctrl, /aucune signature à attester/);
    assert.match(ctrl, /reason: 'Attestation de signature'/);
    // IP et appareil sont déchiffrés (chiffrés au repos).
    assert.match(ctrl, /decrypt\(doc\.signer_ip\)/);
});

test('l\'écran propose le téléchargement de l\'attestation sur un document signé', () => {
    const ui = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
    assert.match(ui('api/apiClient.js'), /export function downloadDocumentPreuve\(id/);
    assert.match(ui('api/apiClient.js'), /\/documents\/\$\{id\}\/preuve/);
    const modal = ui('components/DocumentViewModal.jsx');
    assert.match(modal, /downloadDocumentPreuve/);
    assert.match(modal, /Attestation de signature \(preuve\)/);
});
