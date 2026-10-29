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
    assert.match(c, /l\.opco, l\.first_name, l\.last_name\s+FROM enrollment e JOIN learner l/);
    assert.ok(c.includes("name: `${e.last_name || ''} ${e.first_name || ''}`.trim() || 'Stagiaire'"),
        'le nom du stagiaire est calculé sur l\'inscription');
    // L'étape « stagiaire » (pas company_level, pas QCM) porte la liste ; les autres, non.
    assert.match(c, /stagiaires: \(!s\.company_level && !s\.quiz_id\)/);
    assert.match(c, /dossiersConcernes\(s\)\.map\(\(e\) => \(\{ enrollment_id: e\.id, learner_id: e\.learner_id, name: e\.name,/);
});

test('une étape PIÈCE attache aussi les fichiers déposés par dossier (pour l\'œil « Voir » de la carte)', () => {
    const c = lireApi('controllers/company.controller.js');
    // Les fichiers déposés se lisent dans la branche pièce, par dossier (enrollment_id → [{id, nom}]).
    assert.match(c, /piecesParDossier = new Map\(\);/);
    assert.match(c, /SELECT d\.enrollment_id, pf\.id, pf\.nom FROM piece_fichier pf\s+JOIN piece_depot d ON d\.id = pf\.depot_id/);
    // La liste des stagiaires porte ces fichiers UNIQUEMENT pour une pièce (piecesParDossier non nul).
    assert.match(c, /\.\.\.\(piecesParDossier \? \{ fichiers: piecesParDossier\.get\(e\.id\) \|\| \[\] \} : \{\}\)/);
});

test('la fiche entreprise mène à la fiche stagiaire : un seul directement, plusieurs au choix', () => {
    const e = lireUi('pages/EntrepriseDetail.jsx');
    // Une étape qui n'est pas « de groupe » délègue au geste « stagiaire » (au lieu de ne rien montrer).
    assert.match(e, /if \(!s\.company_level\) return gestesStagiaire\(s\);/);
    assert.match(e, /function gestesStagiaire\(s\)/);
    // Le lien ouvre la fiche du stagiaire sur CE dossier (lib/lienDossier, onglet Formation).
    assert.match(e, /import \{ lienDossier \} from "\.\.\/lib\/lienDossier\.js";/);
    assert.match(e, /to=\{lienDossier\(st\.learner_id, st\.enrollment_id\)\}/);
    // Un seul stagiaire : un bouton direct (plus l'œil « Voir » si pièce). Plusieurs : une ligne par stagiaire.
    assert.match(e, /lien\(st, "Gérer sur la fiche stagiaire"\)/);
    assert.match(e, /stagiaires\.map\(\(st\) => \(/);
    // Aucun stagiaire concerné : aucun bouton (la sous-ligne le dit déjà).
    assert.match(e, /if \(!stagiaires\.length\) return null;/);
});

test('une pièce déposée se regarde depuis la carte entreprise : un œil « Voir » sur le dernier fichier', () => {
    const e = lireUi('pages/EntrepriseDetail.jsx');
    // L'œil n'apparaît QUE pour une pièce, et seulement si un fichier est déposé (rien après un refus).
    assert.match(e, /const oeil = \(st\) => \{/);
    assert.match(e, /const dernier = fichiers\[fichiers\.length - 1\];/);
    assert.match(e, /if \(!s\.piece \|\| !dernier\) return null;/);
    // Il ouvre le fichier en ligne (même chemin que la remise au stagiaire), via pieceFichierUrl.
    assert.match(e, /window\.open\(pieceFichierUrl\(dernier\.id\), "_blank", "noopener"\)/);
    assert.match(e, /pieceFichierUrl,/); // importé depuis apiClient
    // L'œil est posé aussi bien pour un seul stagiaire que pour chacun d'une liste.
    assert.match(e, /return <>\{oeil\(st\)\}\{lien\(st, "Gérer sur la fiche stagiaire"\)\}<\/>;/);
});

test('la fiche stagiaire affiche le message venu de la fiche entreprise (location.state.info)', () => {
    const s = lireUi('pages/StagiaireDetail.jsx');
    assert.match(s, /useLocation/);
    assert.match(s, /if \(location\.state\?\.info\) setStatus\(\{ type: "info", message: location\.state\.info \}\)/);
});
