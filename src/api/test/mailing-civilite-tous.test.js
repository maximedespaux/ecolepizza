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
    // Année(S) : restreint aux inscrits d'une session de L'UNE des années cochées (plusieurs possibles).
    assert.match(src, /JOIN enrollment e ON e\.learner_id = l\.id JOIN training_session s ON s\.id = e\.session_id/);
    assert.match(src, /where\.push\('s\.year IN \(\?\)'\)/, 'plusieurs années : s.year IN (?)');
    assert.match(src, /b\.annees\) \? b\.annees\.map\(Number\)/, 'une LISTE d\'années');
    assert.match(src, /if \(!annees\.length && Number\(b\.annee\)\)/, 'le champ unique annee reste accepté (repli)');
    assert.match(src, /cible: `Tous les stagiaires \(/, 'le journal nomme la cible');
});

test('TOUS — plusieurs années filtrent par s.year IN (serveur, fausse base)', async () => {
    /* Preuve d'exécution : avec deux années cochées, la requête part avec `s.year IN (?)` et la
       liste des années. On capture le SQL sur une fausse connexion. */
    let vueSql = '', vueParams = null;
    const faux = { query: async (sql, params) => {
        if (/s\.year IN/.test(sql)) { vueSql = sql; vueParams = params; }
        return [[]]; // aucun destinataire, peu importe pour la preuve de requête
    } };
    const { resoudreCibles } = require('../controllers/mailing.controller.js');
    await resoudreCibles(faux, 'org1', { type: 'tous', compte: 'avec', annees: [2025, 2026, 2025] });
    assert.match(vueSql, /s\.year IN \(\?\)/);
    assert.match(vueSql, /l\.user_id IS NOT NULL/, 'le filtre « avec compte » est combiné');
    // Dédoublonnées et triées : [2025, 2026].
    assert.deepStrictEqual(vueParams[vueParams.length - 1], [2025, 2026]);
});

test("l'écran « Écrire à un groupe » offre « Tous les stagiaires » : compte + plusieurs années", () => {
    const page = sansCommentaires(lire(path.join(UI, 'pages/Mailing.jsx')));
    assert.match(page, /<option value="tous">Tous les stagiaires/);
    assert.match(page, /value=\{compte\} onChange=\{\(e\) => setCompte\(e\.target\.value\)\}/);
    // Les années sont des pastilles à cocher (ensemble), plus un menu déroulant unique.
    assert.match(page, /const toggleAnnee = \(y\) =>/);
    assert.match(page, /onClick=\{\(\) => toggleAnnee\(y\)\}/);
    assert.match(page, /quoi = \{ type: "tous", compte, annees: anneesSelListe \}/);
    assert.match(page, /cible = \{ type: "tous", compte, annees: anneesSelListe \}/);
});
