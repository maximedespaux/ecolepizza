/**
 * MAILING — le jeton {Civilité}, et « Tous les stagiaires » par compte et par année
 * (demandé le 2026-10-07).
 *
 *   · {Civilité} (« Monsieur », « Madame »…) s'ajoute aux jetons d'un envoi à un groupe, à côté de
 *     {Prénom}/{Nom} : on écrit « Bonjour {Civilité} {Nom}, ». Comme eux, il est PAR PERSONNE — un
 *     message qui le porte part une fois par destinataire.
 *   · une cible « tous » vise TOUS les stagiaires de l'organisme, filtrés par COMPTE (avec un espace,
 *     sans, ou les deux) et par ANNÉE d'inscription (toutes, ou une année). Le plafond d'envoi reste.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { JETONS_GROUPE, rendre, lireEnvoiGroupe } = require('../lib/mailsPersonnalises.js');

test('{Civilité} est un jeton de groupe, rendu et accepté', () => {
    assert.ok(JETONS_GROUPE.includes('Civilité'), '{Civilité} fait partie des jetons proposés');
    // Rendu avec sa valeur, à côté du nom.
    assert.strictEqual(rendre('Bonjour {Civilité} {Nom},', { 'Civilité': 'Madame', Nom: 'BERGER' }), 'Bonjour Madame BERGER,');
    // Accepté à l'enregistrement (pas « jeton inconnu »).
    const lu = lireEnvoiGroupe({ objet: 'Bonjour {Civilité}', corps: 'Message à {Civilité} {Nom}.' });
    assert.ok(!lu.erreur, lu.erreur || 'aucun refus');
    // Un jeton VRAIMENT inconnu reste refusé.
    assert.ok(lireEnvoiGroupe({ objet: 'x', corps: 'Hello {Inexistant}' }).erreur, 'un jeton inconnu est refusé');
});

test("le serveur lit la civilité et la passe au message (envoi et copie école)", () => {
    const src = sansCommentaires(lire(path.join(API, 'controllers/mailing.controller.js')));
    // La civilité est LUE dans chaque requête de destinataires.
    assert.ok(/SELECT DISTINCT l\.id, l\.civility, l\.first_name/.test(src), 'les requêtes DISTINCT lisent civility');
    assert.ok(/SELECT id, civility, first_name, last_name, email FROM learner/.test(src), 'les requêtes learner lisent civility');
    // Et REMPLIE dans les valeurs de jetons (par personne, et sur la copie à l'école).
    assert.match(src, /'Civilité': l\.civility \|\| ''/, 'chaque message porte la civilité de la personne');
    assert.match(src, /'Civilité': avec\[0\]\.civility \|\| ''/, 'la copie à l\'école aussi');
});

test("l'écran propose {Civilité}, et le traite comme personnalisant", () => {
    const page = lire(path.join(UI, 'pages/Mailing.jsx'));
    assert.match(page, /jetons=\{\["Civilité", "Prénom", "Nom", "Organisme"\]\}/, 'la barre d\'insertion propose {Civilité}');
    // Un message avec {Civilité} part UNE FOIS PAR PERSONNE (comme {Prénom}/{Nom}).
    assert.match(page, /\/\\\{\(Civilité\|Prénom\|Nom\)\\\}\//, '{Civilité} compte comme un jeton personnalisant');
});

test('TOUS LES STAGIAIRES — filtré par compte et par année (serveur)', () => {
    const src = sansCommentaires(lire(path.join(API, 'controllers/mailing.controller.js')));
    assert.match(src, /if \(type === 'tous'\)/, 'une cible « tous »');
    // Compte : avec un espace (user_id non nul), sans (nul), ou les deux.
    assert.match(src, /l\.user_id IS NOT NULL/, 'avec compte');
    assert.match(src, /l\.user_id IS NULL/, 'sans compte');
    // Année : restreint aux inscrits d'une session de cette année.
    assert.match(src, /JOIN enrollment e ON e\.learner_id = l\.id JOIN training_session s ON s\.id = e\.session_id/);
    assert.match(src, /where\.push\('s\.year = \?'\)/);
    assert.match(src, /cible: `Tous les stagiaires \(/, 'le journal nomme la cible');
});

test("l'écran « Écrire à un groupe » offre « Tous les stagiaires » avec compte et année", () => {
    const page = sansCommentaires(lire(path.join(UI, 'pages/Mailing.jsx')));
    assert.match(page, /<option value="tous">Tous les stagiaires/);
    // Les deux filtres existent et partent au serveur.
    assert.match(page, /value=\{compte\} onChange=\{\(e\) => setCompte\(e\.target\.value\)\}/);
    assert.match(page, /value=\{annee\} onChange=\{\(e\) => setAnnee\(e\.target\.value\)\}/);
    assert.match(page, /quoi = \{ type: "tous", compte, annee: annee \? Number\(annee\) : 0 \}/);
    assert.match(page, /cible = \{ type: "tous", compte, annee: annee \? Number\(annee\) : 0 \}/);
});
