/**
 * VOIR / TÉLÉCHARGER / RETIRER UNE PIÈCE DEPUIS SA CARTE DU PARCOURS (demandé le 2026-10-29).
 *
 * LE BESOIN. Sur la fiche stagiaire, une carte de DOCUMENT généré porte ses gestes (œil, télécharger,
 * corbeille) ; une carte de PIÈCE — « Attestation contribution au faf » — n'en portait aucun : pour
 * voir ou retirer le fichier déposé, il fallait descendre jusqu'au panneau « Pièces justificatives ».
 * On pose donc les trois gestes SUR la carte, comme pour un document.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · une pièce n'a pas de document généré : ses gestes portent sur les FICHIERS déposés
 *     (`piecesParType.get(s.piece_id)`), remontés par la revue des pièces (PiecesReview → onLoaded)
 *     pour éviter un second fetch, et bornés au DOSSIER affiché (pas les fichiers de l'ancien onglet) ;
 *   · « Voir » ouvre le fichier `inline` (pieceFichierUrl), « Télécharger » l'ENREGISTRE (helper
 *     download, même endpoint), « Retirer » est la PURGE MANUELLE (supprimerPieceFichier) — définitive,
 *     d'où la confirmation, et qui recharge le parcours (parcoursRefresh) ;
 *   · aucun geste tant qu'aucun fichier n'est déposé (return null) ;
 *   · l'endpoint sert le fichier au PERSONNEL — c'est ce qui rend « Voir » / « Télécharger »
 *     atteignables depuis la fiche. Le geler : un futur verrouillage casserait les boutons en silence.
 *
 * Tests de câblage (composants React + source serveur, non exécutables ici), comme leurs miroirs
 * (fiche-entreprise-doc-stagiaire, remise-telecharger-recue).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

test('apiClient : downloadPieceFichier ENREGISTRE le fichier (et ne l\'ouvre pas) ; pieceFichierUrl reste', () => {
    const api = lireUi('api/apiClient.js');
    /* Le helper `download` fait un fetch du blob puis un clic sur une ancre `download` : c'est lui
       qui force l'enregistrement, puisque le serveur sert le fichier en `inline`. */
    assert.match(api, /export function downloadPieceFichier\(fichierId, filename\) \{ return download\(`\/pieces\/fichier\/\$\{fichierId\}`, filename \|\| "piece"\); \}/);
    /* La route de « Voir » (ouverture en onglet) reste, inchangée : les deux coexistent. */
    assert.match(api, /export function pieceFichierUrl\(fichierId\) \{ return `\$\{API_BASE_URL\}\/pieces\/fichier\/\$\{fichierId\}`; \}/);
});

test('fiche stagiaire : une carte « pièce » porte voir / télécharger / retirer, sur ses fichiers déposés', () => {
    const p = lireUi('pages/StagiaireDetail.jsx');
    // Le geste d'une pièce lit les fichiers du dossier affiché par leur TYPE (= step.piece_id).
    assert.match(p, /if \(s\.piece\) \{/);
    assert.match(p, /const p = piecesParType\.get\(s\.piece_id\);/);
    // Aucun geste tant qu'aucun fichier n'est déposé.
    assert.match(p, /if \(!p \|\| !fichiers\.length\) return null;/);
    // Voir (inline), télécharger (enregistré), retirer (purge manuelle).
    assert.match(p, /window\.open\(pieceFichierUrl\(f\.id\), "_blank", "noopener"\)/);
    assert.match(p, /onClick=\{\(\) => telechargerPiece\(f\)\}/);
    assert.match(p, /onClick=\{\(\) => retirerPiece\(f, p\)\}/);
    // Plusieurs fichiers : une ligne chacun (même disposition que les documents par OPCO).
    assert.match(p, /<div className="parc-gestes-multi">/);
});

test('fiche stagiaire : télécharger et retirer un fichier de pièce (helpers)', () => {
    const p = lireUi('pages/StagiaireDetail.jsx');
    // Télécharger : passe par downloadPieceFichier, sous le nom du fichier.
    assert.match(p, /async function telechargerPiece\(f\) \{\s*try \{ await downloadPieceFichier\(f\.id, f\.nom \|\| "piece"\); \}/);
    // Retirer : confirmation (purge définitive), suppression, puis rechargement du parcours.
    assert.match(p, /async function retirerPiece\(f, p\) \{/);
    assert.match(p, /window\.confirm\(`Retirer « \$\{f\.nom \|\| "ce fichier"\} » de « \$\{p\.label\} » \?/);
    assert.match(p, /await supprimerPieceFichier\(f\.id\); setParcoursRefresh\(\(n\) => n \+ 1\);/);
});

test('fiche stagiaire : les pièces viennent de la revue (onLoaded) et sont bornées au dossier affiché', () => {
    const p = lireUi('pages/StagiaireDetail.jsx');
    // La revue remonte ses pièces : pas de second fetch.
    assert.match(p, /<PiecesReview enrollmentId=\{curEnrId\} refresh=\{parcoursRefresh\} onLoaded=\{setPiecesDossier\} \/>/);
    // Bornées au dossier courant : au changement d'onglet, pas les fichiers de l'ancien dossier.
    assert.match(p, /const piecesParType = \(piecesDossier && piecesDossier\.enrollmentId === curEnrId\)/);
});

test('PiecesReview : remonte { enrollmentId, pieces } à chaque chargement (onLoaded)', () => {
    const r = lireUi('components/PiecesReview.jsx');
    assert.match(r, /export default function PiecesReview\(\{ enrollmentId, refresh, onLoaded \}\) \{/);
    // L'enrollmentId voyage avec les pièces, pour borner l'affichage au bon dossier.
    assert.match(r, /onLoaded\?\.\(\{ enrollmentId, pieces: r\.data \|\| \[\] \}\)/);
    // Dossier absent : on remonte une liste vide (pas de gestes orphelins).
    assert.match(r, /if \(!enrollmentId\) \{ setPieces\(\[\]\); onLoaded\?\.\(\{ enrollmentId, pieces: \[\] \}\); return; \}/);
});

test('le serveur sert un fichier de pièce au PERSONNEL (ce qui rend « Voir » / « Télécharger » atteignables)', () => {
    const ctrl = lireApi('controllers/piece.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('const servirFichier'), ctrl.indexOf('* DELETE /api/pieces/fichier/:id'));
    /* Garde : propriétaire OU personnel. Si elle se resserrait au seul stagiaire, « Voir » et
       « Télécharger » renverraient 403 depuis la fiche, sans prévenir. */
    assert.match(fn, /const staff = estPersonnel\(req\.user\);/);
    assert.match(fn, /if \(f\.user_id !== req\.user\.id && !staff\) return res\.status\(403\)\.end\(\);/);
    /* Servi `inline` : le navigateur l'afficherait — d'où l'enregistrement forcé côté client. */
    assert.match(fn, /Content-Disposition', `inline; filename=/);
});
