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
