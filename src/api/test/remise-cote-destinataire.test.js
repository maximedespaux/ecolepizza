/**
 * UNE REMISE SE GÈRE DU CÔTÉ DE SON DESTINATAIRE (2026-10-06).
 *
 * Une remise destinée à l'ENTREPRISE (AGEFICE…) se dépose sur la fiche ENTREPRISE ; une destinée au
 * STAGIAIRE, sur la fiche STAGIAIRE. L'autre côté n'offre pas le dépôt — il y MÈNE par un bouton
 * « Gérer sur la fiche… » (comme les documents de groupe), et ne liste pas la remise qui ne le
 * concerne pas. On raisonne sur le destinataire EFFECTIF (`remiseEntreprise` / `pour_entreprise`) :
 * une remise à l'entreprise SANS espace revient au stagiaire, donc reste de son côté.
 *
 * Le dépôt se lit « fichiers / max » quand un nombre est fixé (migration 203) — les étapes portent
 * le max/mode du type et le compte de fichiers (par dossier côté stagiaire, en somme côté entreprise).
 *
 * Tests de câblage (composants React + source serveur, non exécutables ici), comme leurs miroirs.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
const lireApi = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('fiche stagiaire : une remise destinée à l\'entreprise mène à la fiche entreprise', () => {
    const p = lireUi('pages/StagiaireDetail.jsx');
    assert.match(p, /if \(s\.remise && s\.remiseEntreprise\) \{/);
    assert.match(p, /est remis à l'entreprise : déposez-le ici/);
    assert.match(p, /Gérer sur la fiche entreprise/);
    // Sans entreprise au dossier, aucun geste (rien à y gérer).
    assert.match(p.slice(p.indexOf('if (s.remise && s.remiseEntreprise)')), /if \(!curEnr\?\.company_id\) return null;/);
});

test('le panneau « Documents remis » du stagiaire n\'affiche pas celles destinées à l\'entreprise', () => {
    const r = lireUi('components/RemisesReview.jsx');
    assert.match(r, /const visibles = \(remises \|\| \[\]\)\.filter\(\(r\) => !r\.pour_entreprise\);/);
    assert.match(r, /if \(!visibles\.length\) return null;/);
    assert.match(r, /\{visibles\.map\(\(r\) =>/, 'on n\'itère QUE les remises du stagiaire');
});

test('le serveur porte le nombre de documents sur l\'étape de remise (max, mode, fichiers déposés)', () => {
    // Le MAX et le MODE viennent du type, posés sur l'étape (formationProgram).
    assert.match(lireApi('controllers/formationProgram.controller.js'), /nb_documents: Number\(rm\.nb_documents\) \|\| 0/);
    // Le parcours d'un stagiaire : fichiers de CE dossier.
    assert.match(lireApi('lib/parcours.js'), /nb_documents: r\.s\.nb_documents \|\| 0, nb_mode: r\.s\.nb_mode \|\| 'PLAFOND', nb_fichiers: r\.nbFichiers \|\| 0/);
    assert.match(lireApi('controllers/enrollment.controller.js'), /nb_fichiers: Number\(r\.nb_fichiers\) \|\| 0/);
    // Le parcours du groupe : SOMME des fichiers, dossiers « sans objet » exclus.
    const comp = lireApi('controllers/company.controller.js');
    assert.match(comp, /nbFichiersGroupe = lignes\.filter\(\(l\) => !Number\(l\.sans_objet\)\)\.reduce/);
    assert.match(comp, /nb_documents: s\.nb_documents \|\| 0, nb_mode: s\.nb_mode \|\| 'PLAFOND', nb_fichiers: nbFichiersGroupe/);
});
