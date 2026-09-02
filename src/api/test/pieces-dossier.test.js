/**
 * PIÈCES JUSTIFICATIVES — deux invariants du backend, gelés.
 *
 *  1. La jointure du dossier passe par `training_session` (le programme), PAS par un `e.program_id`
 *     inexistant. Ce bug (colonne absente) dormait depuis que la table `enrollment` n'a que
 *     `session_id` : `piecesDuDossier` levait « Unknown column e.program_id » à la première lecture
 *     — jamais déclenché tant qu'aucun front n'appelait la route.
 *  2. Les octets sont CHIFFRÉS au repos : `deposer` passe par `encryptBytes`, `servirFichier` par
 *     `decryptBytes`. Un scan de carte d'identité ne doit jamais reposer en clair dans la base.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'piece.controller.js'), 'utf8');
const { computeDocParcours } = require('../lib/parcours.js');

test('une pièce VALIDÉE fait avancer le parcours ; déposée-mais-pas-validée non', () => {
    const steps = [{ slug: 'id', label: 'Pièce', doc_type: 'PIECE', piece_id: 'pt1' }, { slug: 'devis', label: 'Devis', stagiaire_sign: 1 }];
    const validee = computeDocParcours({ steps, docs: [], pieces: { pt1: 'VALIDEE' } });
    assert.strictEqual(validee.steps[0].status, 'done', 'pièce validée ⇒ étape faite');
    assert.strictEqual(validee.currentIndex, 1, 'le parcours passe à l\'étape suivante');
    const deposee = computeDocParcours({ steps, docs: [], pieces: { pt1: 'DEPOSEE' } });
    assert.strictEqual(deposee.currentIndex, 0, 'déposée mais non validée ⇒ le parcours attend l\'approbation');
    assert.strictEqual(deposee.steps[0].piece, true, 'l\'étape est marquée « pièce » (pas de bouton Préparer)');
    // Rétro-compat : sans le paramètre `pieces`, une étape pièce reste « en attente » (ATTENDUE, non faite).
    assert.strictEqual(computeDocParcours({ steps }).steps[0].pieceStatus, 'ATTENDUE');
});

test('le dossier de pièces se relie au programme VIA la session (jamais e.program_id)', () => {
    assert.match(src, /JOIN training_session s ON s\.id = e\.session_id/,
        "enrollment n'a pas de program_id : il faut joindre training_session pour atteindre le programme.");
    assert.match(src, /ps\.program_id = s\.program_id/, 'les étapes se résolvent sur le programme de la session.');
    assert.doesNotMatch(src, /ps\.program_id = e\.program_id/,
        "e.program_id n'existe pas — cette jointure lèverait « Unknown column » à la lecture.");
});

test('les octets des pièces sont chiffrés au repos (dépôt) et déchiffrés à la lecture', () => {
    assert.match(src, /encryptBytes\(f\.buffer\)/, 'deposer doit chiffrer le fichier avant de le stocker.');
    assert.match(src, /decryptBytes\(f\.bytes\)/, 'servirFichier doit déchiffrer à la volée.');
    assert.doesNotMatch(src, /res\.send\(f\.bytes\)/, 'ne jamais renvoyer les octets bruts stockés.');
    assert.doesNotMatch(src, /mime, f\.buffer, f\.buffer\.length/, 'ne jamais stocker le buffer EN CLAIR.');
});

test('refuser une pièce PURGE le(s) fichier(s) déposé(s)', () => {
    // Un scan d'identité refusé ne doit pas rester en base ; le stagiaire en renvoie un neuf.
    assert.match(src, /statut === 'REFUSEE'[\s\S]*?DELETE FROM piece_fichier WHERE depot_id/,
        'verifier doit supprimer les fichiers du dépôt au refus (le dépôt/motif restent, pas les octets).');
});
