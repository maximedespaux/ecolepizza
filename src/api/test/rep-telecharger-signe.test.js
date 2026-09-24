/**
 * L'ENTREPRISE TÉLÉCHARGE SON DOCUMENT SIGNÉ (demandé le 2026-09-24).
 *
 * Le représentant pouvait signer un document d'entreprise, mais pas en récupérer l'exemplaire : le
 * téléchargement du PDF (downloadPdf) n'autorise que le personnel, le stagiaire propriétaire ou un
 * signataire dont la case porte son user_id — or la signature du représentant (créneau `representant`)
 * n'en porte pas, et un document d'entreprise n'a pas de stagiaire. D'où une route dédiée, gardée par
 * les DONNÉES du compte (entreprises rattachées), qui sert le PDF SIGNÉ tel quel — celui qui fait foi.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

test('le représentant télécharge le PDF SIGNÉ, gardé par les données de son compte', () => {
    const ctrl = lire('controllers/rep.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('const downloadRepDocument'), ctrl.indexOf('module.exports'));
    /* Uniquement les documents des entreprises rattachées au compte (garde par les DONNÉES, pas le rôle). */
    assert.match(fn, /scope = 'COMPANY' AND company_id IN \(\?\)/);
    /* Réservé aux documents SIGNÉS : le PDF figé fait foi, jamais régénéré (cela invaliderait les signatures). */
    assert.match(fn, /if \(doc\.status !== 'SIGNE'\) return res\.status\(409\)/);
    assert.match(fn, /await loadSignedPdf\(conn, doc\.id\)/);
    assert.match(fn, /'application\/pdf'/);
    /* La route existe, sous authentification. */
    assert.match(lire('routes/rep.routes.js'), /router\.get\('\/documents\/:id\/pdf', downloadRepDocument\);/);
    /* loadSignedPdf est bien exporté par document.controller (sinon le require renverrait undefined). */
    assert.match(lire('controllers/document.controller.js'), /module\.exports = \{[^}]*\bloadSignedPdf\b[^}]*\}/);
});

test('l\'écran du représentant n\'offre « Télécharger » qu\'une fois le document signé', () => {
    const ui = lireUi('pages/RepresentantEspace.jsx');
    assert.match(ui, /\{d\.status === "SIGNE" && <button/);
    assert.match(ui, /window\.open\(repDocumentPdfUrl\(d\.id\), "_blank", "noopener"\)/);
    /* URL directe, authentifiée par le cookie (comme les autres fichiers servis). */
    assert.match(lireUi('api/apiClient.js'), /repDocumentPdfUrl\(id\) \{ return `\$\{API_BASE_URL\}\/rep\/documents\/\$\{id\}\/pdf`; \}/);
});
