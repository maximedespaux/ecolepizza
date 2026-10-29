/**
 * VOIR / TÉLÉCHARGER / RETIRER UNE PIÈCE DEPUIS SA CARTE DU PARCOURS (demandé le 2026-10-29).
 *
 * LE BESOIN. Sur la fiche stagiaire, une carte de DOCUMENT généré porte ses gestes (œil, télécharger,
 * corbeille) ; une carte de PIÈCE — « Attestation contribution au faf » — n'en portait aucun : pour
 * voir ou retirer le fichier déposé, il fallait descendre jusqu'au panneau « Pièces justificatives ».
 * On pose les trois gestes SUR la carte, comme pour un document.
 *
 * LE PIÈGE (corrigé ici). Une première version lisait les fichiers depuis la liste des pièces du
 * dossier (getDossierPieces / listDossier), BORNÉE aux piece_steps du programme. Or une pièce arrivée
 * PAR L'ENTREPRISE (volet entreprise d'une formation) a bien un piece_depot sur le dossier — le
 * parcours en lit le statut — mais n'est PAS un piece_step du programme : listDossier renvoyait [], la
 * carte restait sans boutons (relevé en prod sur « Attestation contribution au faf », VALIDÉE). On lit
 * donc les fichiers à LA SOURCE, le piece_depot, dans le parcours lui-même (getParcours →
 * computeDocParcours) : l'étape porte `fichiers`, couvrant pièces du programme ET de l'entreprise.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · computeDocParcours attache les fichiers déposés (`fichiers`) à l'étape « pièce » ;
 *   · getParcours les lit du piece_depot (JOIN piece_fichier), par enrollment — donc hors listDossier ;
 *   · la carte lit `s.fichiers` : « Voir » ouvre inline (pieceFichierUrl), « Télécharger » enregistre
 *     (downloadPieceFichier, même endpoint), « Retirer » est la purge manuelle (supprimerPieceFichier) ;
 *   · aucun geste tant qu'aucun fichier n'est déposé ;
 *   · l'endpoint sert le fichier au PERSONNEL — ce qui rend « Voir » / « Télécharger » atteignables.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

const { computeDocParcours } = require('../lib/parcours.js');

test('computeDocParcours : l\'étape « pièce » porte ses fichiers déposés (id + nom)', () => {
    const parc = computeDocParcours({
        steps: [{ slug: 'piece:faf', label: 'Attestation contribution au faf', piece_id: 'pt-faf' }],
        docs: [], pieces: { 'pt-faf': 'VALIDEE' },
        pieceFichiers: { 'pt-faf': [{ id: 'f1', nom: 'attestation.pdf' }, { id: 'f2', nom: 'p2.pdf' }] },
    });
    const st = parc.steps[0];
    assert.equal(st.piece, true);
    assert.equal(st.pieceStatus, 'VALIDEE');
    assert.deepEqual(st.fichiers, [{ id: 'f1', nom: 'attestation.pdf' }, { id: 'f2', nom: 'p2.pdf' }]);
});

test('computeDocParcours : sans fichiers pour la pièce, l\'étape a une liste vide (jamais undefined)', () => {
    const parc = computeDocParcours({
        steps: [{ slug: 'piece:x', label: 'Pièce', piece_id: 'pt-x' }],
        docs: [], pieces: { 'pt-x': 'DEPOSEE' }, // déposée mais pieceFichiers absent
    });
    assert.deepEqual(parc.steps[0].fichiers, []);
    // Un document ordinaire n'est pas une pièce et n'a pas de fichiers déposés.
    const doc = computeDocParcours({ steps: [{ slug: 'convention', label: 'Convention' }], docs: [], pieces: {} });
    assert.deepEqual(doc.steps[0].fichiers, []);
});

test('getParcours lit les fichiers de pièce du piece_depot (par enrollment), hors listDossier', () => {
    const ctrl = lireApi('controllers/enrollment.controller.js');
    // JOIN piece_fichier ↔ piece_depot, borné au dossier : couvre aussi une pièce d'entreprise.
    assert.match(ctrl, /FROM piece_fichier pf\s+JOIN piece_depot d ON d\.id = pf\.depot_id\s+WHERE d\.enrollment_id = \? AND d\.organization_id = \?/);
    assert.match(ctrl, /\(pieceFichiers\[r\.piece_type_id\] \|\|= \[\]\)\.push\(\{ id: r\.id, nom: r\.nom \}\)/);
    // Et ils sont passés au calcul du parcours.
    assert.match(ctrl, /computeDocParcours\(\{ steps, docs, pieces, pieceFichiers, remises, entreprise: entrepriseAvecEspace \}\)/);
});

test('apiClient : downloadPieceFichier ENREGISTRE le fichier (et ne l\'ouvre pas) ; pieceFichierUrl reste', () => {
    const api = lireUi('api/apiClient.js');
    assert.match(api, /export function downloadPieceFichier\(fichierId, filename\) \{ return download\(`\/pieces\/fichier\/\$\{fichierId\}`, filename \|\| "piece"\); \}/);
    assert.match(api, /export function pieceFichierUrl\(fichierId\) \{ return `\$\{API_BASE_URL\}\/pieces\/fichier\/\$\{fichierId\}`; \}/);
});

test('fiche stagiaire : la carte « pièce » lit s.fichiers et porte voir / télécharger / retirer', () => {
    const p = lireUi('pages/StagiaireDetail.jsx');
    // Les fichiers viennent de l'étape (posés par le serveur), pas de getDossierPieces.
    assert.match(p, /if \(s\.piece\) \{\s*const fichiers = s\.fichiers \|\| \[\];/);
    assert.match(p, /if \(!fichiers\.length\) return null;/);
    // Voir (inline), télécharger (enregistré), retirer (purge manuelle, sur l'étape s).
    assert.match(p, /window\.open\(pieceFichierUrl\(f\.id\), "_blank", "noopener"\)/);
    assert.match(p, /onClick=\{\(\) => telechargerPiece\(f\)\}/);
    assert.match(p, /onClick=\{\(\) => retirerPiece\(f, s\)\}/);
    assert.match(p, /<div className="parc-gestes-multi">/);
    // Plus de dépendance à la revue des pièces pour ces gestes (ni lift onLoaded, ni index par type).
    assert.doesNotMatch(p, /piecesParType/);
    assert.doesNotMatch(p, /onLoaded=\{setPiecesDossier\}/);
});

test('fiche stagiaire : retirer un fichier de pièce (confirmation + purge + rechargement)', () => {
    const p = lireUi('pages/StagiaireDetail.jsx');
    assert.match(p, /async function retirerPiece\(f, s\) \{/);
    assert.match(p, /const fichiers = s\.fichiers \|\| \[\];/);
    assert.match(p, /window\.confirm\(`Retirer « \$\{f\.nom \|\| "ce fichier"\} » de « \$\{s\.label\} » \?/);
    assert.match(p, /await supprimerPieceFichier\(f\.id\); setParcoursRefresh\(\(n\) => n \+ 1\);/);
    // Télécharger passe par downloadPieceFichier, sous le nom du fichier.
    assert.match(p, /async function telechargerPiece\(f\) \{\s*try \{ await downloadPieceFichier\(f\.id, f\.nom \|\| "piece"\); \}/);
});

test('le serveur sert un fichier de pièce au PERSONNEL (ce qui rend « Voir » / « Télécharger » atteignables)', () => {
    const ctrl = lireApi('controllers/piece.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('const servirFichier'), ctrl.indexOf('* DELETE /api/pieces/fichier/:id'));
    assert.match(fn, /const staff = estPersonnel\(req\.user\);/);
    assert.match(fn, /if \(f\.user_id !== req\.user\.id && !staff\) return res\.status\(403\)\.end\(\);/);
    assert.match(fn, /Content-Disposition', `inline; filename=/);
});
