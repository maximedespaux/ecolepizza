/**
 * GARDE-FOU À LA SUPPRESSION D'UNE SESSION (demandé le 2026-10-05, après qu'une session pleine a été
 * supprimée par erreur).
 *
 * Le défaut gelé ici : `deleteSession` était un `DELETE` nu, déclenché par un `window.confirm` d'un
 * clic — une session avec des stagiaires partait sans un regard, emportant ses inscriptions (cascade).
 * Désormais :
 *  · le SERVEUR refuse (409) de supprimer une session non vide sans `confirmer=1` ;
 *  · `getSession` annonce le nombre de documents liés (pour l'avertissement) ;
 *  · l'ÉCRAN exige de recopier le nom de la session ET le nombre de stagiaires avant d'armer le bouton.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

test('serveur : une session non vide ne se supprime pas sans confirmation explicite', () => {
    const c = lire('src/api/controllers/session.controller.js');
    // Compte les inscriptions, et refuse (409) s'il en reste sans le drapeau de confirmation.
    assert.match(c, /SELECT COUNT\(\*\) AS n FROM enrollment WHERE session_id = \?/, 'compte les inscriptions avant de supprimer');
    assert.match(c, /n > 0 && req\.query\.confirmer !== '1'/, 'refuse si des inscriptions restent et pas de confirmer=1');
    assert.match(c, /status\(409\)/, 'le refus est un 409 (conflit), pas une suppression silencieuse');
    // Et le compte de documents liés, pour que l'écran puisse l'annoncer.
    assert.match(c, /documents_lies/, 'getSession renvoie le nombre de documents liés');
});

test('client API : deleteSession passe le drapeau confirmer', () => {
    const c = lire('src/app/ui/api/apiClient.js');
    assert.match(c, /export function deleteSession\(id, confirmer = false\)/, 'deleteSession accepte confirmer');
    assert.match(c, /confirmer \? "\?confirmer=1" : ""/, 'le drapeau part dans l\'URL');
});

test('écran : la fenêtre exige le nom de la session ET le nombre de stagiaires', () => {
    const m = lire('src/app/ui/components/SupprimerSessionModal.jsx');
    // Les DEUX conditions, liées par && : recopier le nom ET le nombre.
    assert.match(m, /norm\(nom\) === norm\(nomSession\) && nombre\.trim\(\) === String\(n\)/, 'les deux champs doivent correspondre');
    assert.match(m, /disabled=\{!pret \|\| envoi\}/, 'le bouton rouge n\'est armé que si tout correspond');

    const s = lire('src/app/ui/pages/SessionDetail.jsx');
    assert.match(s, /SupprimerSessionModal/, 'la fiche session ouvre la fenêtre de confirmation');
    assert.match(s, /deleteSession\(id, true\)/, 'la confirmation passe confirmer=true au serveur');
    assert.doesNotMatch(s, /window\.confirm\([^)]*session/i, 'plus de window.confirm d\'un clic pour supprimer la session');
});
