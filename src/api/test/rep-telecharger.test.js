/**
 * L'ENTREPRISE TÉLÉCHARGE SON DOCUMENT — signé ET non signé.
 *
 * D'abord (2026-09-24) : le représentant pouvait signer un document d'entreprise mais pas en
 * récupérer l'exemplaire. Le téléchargement du stagiaire (downloadPdf) n'autorise que le personnel,
 * le stagiaire propriétaire ou un signataire dont la case porte son user_id — or la signature du
 * représentant (créneau `representant`) n'en porte pas, et un document d'entreprise n'a pas de
 * stagiaire. D'où une route dédiée, gardée par les DONNÉES du compte (entreprises rattachées).
 *
 * Puis (2026-10-19, « pouvoir télécharger les docs, à côté d'aperçu et signer ») : cette route ne
 * servait QUE les documents SIGNÉS (409 sinon), si bien que l'entreprise ne pouvait pas garder une
 * copie de ce qu'on lui demandait justement de signer. Elle sert désormais aussi les documents NON
 * signés, rendus à la volée par le MÊME moteur que l'aperçu (renderUnsignedDocPdf) et scellés du
 * cachet de l'organisme. Règle : voir, c'est pouvoir télécharger — l'aperçu l'autorisait déjà, le
 * PDF n'en montre pas plus. Un document SIGNÉ reste servi TEL QUEL (jamais régénéré, cela
 * invaliderait les signatures).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

test('le téléchargement du représentant est gardé par les DONNÉES de son compte', () => {
    const ctrl = lire('controllers/rep.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('const downloadRepDocument'), ctrl.indexOf('module.exports'));
    /* Uniquement les documents des entreprises rattachées au compte (garde par les DONNÉES, pas le rôle). */
    assert.match(fn, /scope = 'COMPANY' AND company_id IN \(\?\)/);
    /* La route existe, sous authentification. */
    assert.match(lire('routes/rep.routes.js'), /router\.get\('\/documents\/:id\/pdf', downloadRepDocument\);/);
});

test('SIGNÉ : le PDF figé fait foi, servi tel quel (jamais régénéré)', () => {
    const ctrl = lire('controllers/rep.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('const downloadRepDocument'), ctrl.indexOf('module.exports'));
    assert.match(fn, /if \(doc\.status === 'SIGNE'\)/);
    assert.match(fn, /await loadSignedPdf\(conn, doc\.id\)/);
    assert.match(fn, /'application\/pdf'/);
    /* loadSignedPdf est bien exporté par document.controller (sinon le require renverrait undefined). */
    assert.match(lire('controllers/document.controller.js'), /module\.exports = \{[^}]*\bloadSignedPdf\b[^}]*\}/);
});

test('NON SIGNÉ : rendu à la volée (même moteur que l\'aperçu), plus de refus 409', () => {
    const ctrl = lire('controllers/rep.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('const downloadRepDocument'), ctrl.indexOf('module.exports'));
    /* Le défaut corrigé : la route refusait tout document non signé. Ce 409 ne doit plus exister. */
    assert.doesNotMatch(fn, /status\(409\)/, 'un document non signé n\'est plus refusé');
    /* Il est rendu par le moteur partagé, pas par un rendu local qui divergerait de l\'aperçu. */
    assert.match(fn, /await renderUnsignedDocPdf\(conn, doc\)/);
    /* renderUnsignedDocPdf est bien exporté par document.controller (sinon le require serait undefined). */
    assert.match(lire('controllers/document.controller.js'), /module\.exports = \{[^}]*\brenderUnsignedDocPdf\b[^}]*\}/);
    assert.match(lire('controllers/rep.controller.js'), /require\('\.\/document\.controller\.js'\);[\s\S]*renderUnsignedDocPdf/);
});

test('renderUnsignedDocPdf : SANS garde d\'accès (l\'appelant l\'a déjà faite), scellé, en brouillon', () => {
    const doc = lire('controllers/document.controller.js');
    const fn = doc.slice(doc.indexOf('async function renderUnsignedDocPdf'), doc.indexOf('async function renderUnsignedDocPdf') + 1600);
    /* Le même moteur de rendu que tout le reste (composeDocPdf) et le même scellé PAdES que le
       téléchargement d'un document non signé côté stagiaire. */
    assert.match(fn, /await composeDocPdf\(conn, \{ doc, ctx, slug, content \}\)/);
    assert.match(fn, /sealPdf\(/);
    /* AUCUN contrôle « informations manquantes » : on sert ce qui est là, comme l'aperçu (sinon le
       bouton « Télécharger » échouerait là où « Aperçu » réussit). */
    assert.doesNotMatch(fn, /findMissingTokens/);
    /* AUCUNE garde d'accès ici : c'est l'appelant (repCompanies / lecteurDuDocument) qui l'a faite. */
    assert.doesNotMatch(fn, /lecteurDuDocument|repCompanies|status\(403\)/);
});

test('l\'écran du représentant propose « Télécharger » pour TOUT document (signé ou non)', () => {
    const ui = lireUi('pages/RepresentantEspace.jsx');
    /* Le bouton n'est plus conditionné à `signed` : il appelle telecharger(d) sans garde. */
    assert.match(ui, /onClick=\{\(\) => telecharger\(d\)\}/);
    assert.doesNotMatch(ui, /\{signed && <button[\s\S]*?Télécharger/, 'le bouton « Télécharger » n\'est plus réservé aux documents signés');
    /* Vrai téléchargement (enregistrement du fichier), pas une ouverture d'onglet. */
    assert.match(ui, /await downloadRepDocumentPdf\(doc\.id, nom\)/);
    assert.match(lireUi('api/apiClient.js'), /export function downloadRepDocumentPdf\(id, filename = "document\.pdf"\) \{[\s\S]*?return download\(`\/rep\/documents\/\$\{id\}\/pdf`, filename\);/);
    /* L'ancienne ouverture d'onglet du PDF signé (repDocumentPdfUrl) n'est plus utilisée ici. */
    assert.doesNotMatch(ui, /repDocumentPdfUrl/);
});
