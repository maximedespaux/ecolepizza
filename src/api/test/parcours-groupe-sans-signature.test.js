/**
 * PARCOURS DE GROUPE : UN DOCUMENT SANS SIGNATURE EST FAIT DÈS QU'IL EST REÇU (constaté le 2026-09-24).
 *
 * En production, un CGV (« Conditions générales de vente », signers=[], stagiaire_sign=0) restait
 * « 0/1 signés » et ne passait JAMAIS « fait » dans le parcours du groupe entreprise — il bloquait
 * la complétion. Or un document sans signataire (hors organisme) ne se signe pas : il est fait dès
 * qu'il est REÇU (même règle que le dossier d'un stagiaire, lib/parcours.js `stepDone`).
 *
 * `getCompanyParcours` comptait `done = signed >= total` pour TOUTES les étapes ; un document sans
 * signature n'atteignait donc jamais son total (personne ne le signe). On compte désormais les REÇUS
 * pour ces documents-là, et l'écran affiche « reçu » au lieu de « 0/1 signés ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');
const { needsSignature, SENT } = require('../lib/parcours.js');

test('la règle « a besoin d\'une signature » : stagiaire OU entreprise (jamais un CGV sans signataire)', () => {
    assert.strictEqual(needsSignature({ stagiaire_sign: 1 }), true);
    assert.strictEqual(needsSignature({ company_sign: 1 }), true);
    assert.strictEqual(needsSignature({ stagiaire_sign: 0, company_sign: 0 }), false, 'un CGV sans signataire n\'attend personne');
    assert.ok(SENT.includes('ENVOYE') && SENT.includes('CONSULTE') && SENT.includes('SIGNE'), 'un document reçu est envoyé/consulté/signé');
});

test('getCompanyParcours : fait = signé POUR CE QUI SE SIGNE, reçu pour le reste', () => {
    const ctrl = lire('controllers/company.controller.js');
    const i = ctrl.indexOf('const getCompanyParcours');
    const fn = ctrl.slice(i, ctrl.indexOf('\nconst ', i + 10));
    /* Un compteur des REÇUS (statuts envoyés), à côté des signés. */
    assert.match(fn, /recu = new Set\(rows\.filter\(\(r\) => SENT\.includes\(r\.status\)\)/);
    /* Le « fait » d'une étape : signatures pour ce qui se signe, RÉCEPTION pour un document sans signature. */
    assert.match(fn, /const attendSignature = !!s\.quiz_id \|\| needsSignature\(s\);/);
    assert.match(fn, /const done = total > 0 && \(attendSignature \? signed >= total : recu >= total\);/);
});

test('l\'écran affiche « reçu » et non « signés » pour un document sans signature', () => {
    const ui = lireUi('components/EnrollmentParcours.jsx');
    assert.match(ui, /if \(!s\.signable && !s\.quiz\) return s\.gen >= s\.total \? "Reçu"/);
});
