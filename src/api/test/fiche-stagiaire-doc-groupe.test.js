/**
 * SUR LA FICHE STAGIAIRE, UN DOCUMENT DE GROUPE RENVOIE À LA FICHE ENTREPRISE (2026-10-03).
 *
 * Un document de GROUPE (company_level — devis professionnel, convention…) ne se génère pas depuis
 * la fiche stagiaire : il appartient au parcours de l'ENTREPRISE. La fiche stagiaire le montrait
 * pourtant avec un bouton « Importer un document reçu » (qui appartient à la fiche entreprise) et
 * aucun chemin pour le préparer. Désormais :
 *   · « Importer un document reçu » ne s'affiche PLUS sur une étape de groupe vue depuis la fiche
 *     stagiaire (importPossible, EnrollmentParcours) — les documents PROPRES au stagiaire gardent
 *     leur import ;
 *   · à la place, un bouton « Gérer sur la fiche entreprise » y mène, sur la BONNE session.
 *
 * Ces tests lisent le câblage au source (composants React, non exécutables ici). Les réintroduire à
 * l'envers (import rendu sur un doc de groupe, lien retiré) les fait rougir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');

test('EnrollmentParcours : pas d\'« Importer » pour un doc de groupe vu depuis la fiche stagiaire', () => {
    const c = lire('components/EnrollmentParcours.jsx');
    // Un company_level qui n'est PAS une étape de groupe (fiche stagiaire) : import refusé.
    assert.match(c, /if \(!isGroup\(s\) && s\.company_level\) return false;/);
    // L'import reste conditionné par importPossible (la règle unique).
    assert.match(c, /onImport && importPossible\(step\)/);
});

test('fiche stagiaire : une étape de groupe mène à la fiche entreprise, sur la bonne session', () => {
    const p = lire('pages/StagiaireDetail.jsx');
    // Le geste d'une étape de groupe : un lien vers la fiche entreprise du dossier…
    assert.match(p, /if \(s\.company_level\) \{/);
    assert.match(p, /to=\{`\/entreprises\/\$\{curEnr\.company_id\}`\}/);
    // … qui emporte la session pour l'ouvrir au bon endroit…
    assert.match(p, /state=\{\{ session: curEnr\.session_id,/);
    assert.match(p, /Gérer sur la fiche entreprise/);
    // … et sans entreprise au dossier, aucun geste (rien à y gérer).
    assert.match(p, /if \(!curEnr\?\.company_id\) return null;/);
});

test('fiche entreprise : la session demandée (venue de la fiche stagiaire) est pré-sélectionnée', () => {
    const e = lire('pages/EntrepriseDetail.jsx');
    assert.match(e, /location\.state\?\.session && ssn\.some\(\(x\) => x\.id === location\.state\.session\)/);
    assert.match(e, /setViewSessionId\(\(cur\) => cur \|\| voulue \|\| \(ssn\[0\]\?\.id \|\| ""\)\)/);
});

test('les inscriptions de la fiche stagiaire portent session_id (pour viser la bonne session)', () => {
    const d = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    assert.match(d, /SELECT e\.id, e\.session_id, e\.financing, e\.company_id/);
});
