/**
 * IMPORTER UNE PIÈCE REÇUE : « Modèle introuvable pour cette étape. »
 *
 * LE DÉFAUT, rencontré en production. Sur la fiche d'un stagiaire, l'étape « Pièce d'identité »
 * porte un bouton d'import — la carte arrive souvent par courriel plutôt que par l'espace du
 * stagiaire. Cliquer dessus répondait « Modèle introuvable pour cette étape. » et n'importait
 * rien.
 *
 * LA CAUSE. Le bouton d'import avait été écarté des étapes `quiz:` — un questionnaire ne se
 * remplace pas par un fichier — mais PAS des étapes « pièce ». Or l'écran cherchait, pour toute
 * étape non générée, un MODÈLE DE DOCUMENT portant le slug de l'étape. Une pièce n'en a pas :
 * elle vit dans `piece_type` / `piece_depot`, un référentiel distinct, avec son propre circuit
 * (déposée → validée, ou refusée avec motif) et sa propre suppression. La recherche échouait
 * donc toujours, et le message accusait un modèle manquant là où c'est la DESTINATION qui était
 * fausse.
 *
 * CE QUI MANQUAIT AUSSI. Le parcours annonçait `piece: true` sans jamais dire DE QUELLE pièce
 * il s'agit. L'écran savait qu'il avait affaire à une pièce et ne pouvait rien en faire : un
 * dépôt se fait sur `/pieces/dossier/:enrollmentId/:pieceTypeId`, il faut donc nommer la cible.
 *
 * Le serveur, lui, autorisait déjà le personnel à déposer pour le compte du stagiaire
 * (`deposer` : tout rôle hors STAGIAIRE / INTERVENANT). Rien à ouvrir de ce côté.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const PARCOURS = fs.readFileSync(path.join(__dirname, '..', 'lib/parcours.js'), 'utf8');
const FICHE = fs.readFileSync(path.join(RACINE, 'app/ui/pages/StagiaireDetail.jsx'), 'utf8');
const ETAPES = fs.readFileSync(path.join(RACINE, 'app/ui/components/EnrollmentParcours.jsx'), 'utf8');
const REVUE = fs.readFileSync(path.join(RACINE, 'app/ui/components/PiecesReview.jsx'), 'utf8');

const { computeDocParcours } = require('../lib/parcours.js');

test('une étape « pièce » dit DE QUELLE pièce il s\'agit', () => {
    /* `piece: true` seul ne permet aucune action : le dépôt vise un type de pièce précis. */
    const parc = computeDocParcours({
        steps: [{ slug: 'piece-identite', label: 'Pièce d\'identité', piece_id: 'pt-42' }],
        docs: [],
        pieces: {},
    });
    const etape = parc.steps[0];
    assert.strictEqual(etape.piece, true);
    assert.strictEqual(etape.piece_id, 'pt-42',
        'sans l\'identifiant du type de pièce, l\'écran ne peut pas déposer le fichier');
});

test('une étape ordinaire ne porte pas d\'identifiant de pièce', () => {
    const parc = computeDocParcours({ steps: [{ slug: 'convention', label: 'Convention' }], docs: [], pieces: {} });
    assert.strictEqual(parc.steps[0].piece, false);
    assert.strictEqual(parc.steps[0].piece_id, null);
});

test('l\'écran aiguille la pièce vers son circuit, pas vers les documents', () => {
    const bloc = FICHE.slice(FICHE.indexOf('async function envoyerImport'));
    const corps = bloc.slice(0, bloc.indexOf('\n  }'));
    assert.match(corps, /if \(step\.piece\) \{/,
        'une étape « pièce » doit être aiguillée AVANT la recherche d\'un modèle de document');
    assert.match(corps, /deposerPiece\(curEnrId, step\.piece_id, file\)/,
        'le dépôt passe par la route des pièces, avec le type visé');
    assert.ok(corps.indexOf('step.piece') < corps.indexOf('templates.find'),
        'l\'aiguillage doit précéder `templates.find`, sinon le message « Modèle introuvable » revient');
});

test('le bouton annonce la bonne destination', () => {
    /* Une pièce ne rejoint pas les documents du dossier mais le circuit des pièces
       justificatives : annoncer « importer un document » ferait chercher le fichier au
       mauvais endroit. */
    assert.match(ETAPES, /step\.piece \? "Déposer la pièce reçue" : "Importer un document reçu"/);
});

test('la revue des pièces se rafraîchit après un dépôt du personnel', () => {
    /* Sans cela, la pièce resterait affichée « à fournir » juste après son arrivée, et il
       faudrait recharger la page pour la voir. */
    assert.match(REVUE, /\[enrollmentId, refresh\]/, 'la carte doit dépendre du compteur de rafraîchissement');
    assert.match(FICHE, /<PiecesReview enrollmentId=\{curEnrId\} refresh=\{parcoursRefresh\} \/>/);
});
