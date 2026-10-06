/**
 * SUR LA FICHE ENTREPRISE, UN DOCUMENT « STAGIAIRE » RENVOIE À LA FICHE STAGIAIRE (2026-10-06).
 *
 * L'INVERSE du « Gérer sur la fiche entreprise » (fiche-stagiaire-doc-groupe.test.js) : un document
 * PROPRE au stagiaire (ni document de groupe, ni QCM) ne se prépare pas depuis la fiche entreprise —
 * il appartient au parcours de CHAQUE stagiaire. La fiche entreprise se contentait d'un texte
 * (« à générer depuis chaque fiche stagiaire »). Désormais elle y MÈNE :
 *   · le serveur attache à chaque étape « stagiaire » la liste des stagiaires concernés
 *     (enrollment_id, learner_id, nom) — `getCompanyParcours` ;
 *   · l'écran rend un bouton « Gérer sur la fiche stagiaire » : un seul stagiaire conduit directement
 *     à sa fiche (onglet Formation, sur CE dossier), plusieurs se choisissent dans la liste ;
 *   · la fiche stagiaire affiche le message venu de la fiche entreprise (location.state.info), comme
 *     la fiche entreprise affiche celui venu de la fiche stagiaire.
 *
 * Ces tests lisent le câblage au source (composants React, non exécutables ici), comme son miroir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lireUi = (p) => fs.readFileSync(path.join(UI, p), 'utf8');
const lireApi = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('le serveur attache les stagiaires concernés à chaque étape « stagiaire » (ni groupe, ni QCM)', () => {
    const c = lireApi('controllers/company.controller.js');
    // Les inscriptions du groupe portent le nom du stagiaire, pour l'afficher dans le bouton.
    assert.match(c, /l\.opco, l\.first_name, l\.last_name FROM enrollment e JOIN learner l/);
    assert.ok(c.includes("name: `${e.last_name || ''} ${e.first_name || ''}`.trim() || 'Stagiaire'"),
        'le nom du stagiaire est calculé sur l\'inscription');
    // L'étape « stagiaire » (pas company_level, pas QCM) porte la liste ; les autres, non.
    assert.match(c, /stagiaires: \(!s\.company_level && !s\.quiz_id\)/);
    assert.match(c, /dossiersConcernes\(s\)\.map\(\(e\) => \(\{ enrollment_id: e\.id, learner_id: e\.learner_id, name: e\.name \}\)\)/);
});

test('la fiche entreprise mène à la fiche stagiaire : un seul directement, plusieurs au choix', () => {
    const e = lireUi('pages/EntrepriseDetail.jsx');
    // Une étape qui n'est pas « de groupe » délègue au geste « stagiaire » (au lieu de ne rien montrer).
    assert.match(e, /if \(!s\.company_level\) return gestesStagiaire\(s\);/);
    assert.match(e, /function gestesStagiaire\(s\)/);
    // Le lien ouvre la fiche du stagiaire sur CE dossier (lib/lienDossier, onglet Formation).
    assert.match(e, /import \{ lienDossier \} from "\.\.\/lib\/lienDossier\.js";/);
    assert.match(e, /to=\{lienDossier\(st\.learner_id, st\.enrollment_id\)\}/);
    // Un seul stagiaire : un bouton direct. Plusieurs : une ligne par stagiaire, à choisir.
    assert.match(e, /if \(stagiaires\.length === 1\) return lien\(stagiaires\[0\], "Gérer sur la fiche stagiaire"\);/);
    assert.match(e, /stagiaires\.map\(\(st\) => \(/);
    // Aucun stagiaire concerné : aucun bouton (la sous-ligne le dit déjà).
    assert.match(e, /if \(!stagiaires\.length\) return null;/);
});

test('la fiche stagiaire affiche le message venu de la fiche entreprise (location.state.info)', () => {
    const s = lireUi('pages/StagiaireDetail.jsx');
    assert.match(s, /useLocation/);
    assert.match(s, /if \(location\.state\?\.info\) setStatus\(\{ type: "info", message: location\.state\.info \}\)/);
});
