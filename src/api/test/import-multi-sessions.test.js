/**
 * IMPORTER UN DOCUMENT REÇU POUR PLUSIEURS FORMATIONS, SANS DOUBLON (2026-10-03).
 *
 * Un stagiaire — ou une entreprise — inscrit à plusieurs sessions importait le même document signé
 * une fois PAR session (le front figeait une seule inscription : `[curEnrId]` côté stagiaire,
 * `session_id: viewSessionId` côté entreprise), d'où autant de doublons du même papier. Désormais,
 * quand il y a plusieurs formations possibles et que le document n'existe pas encore, une fenêtre
 * fait cocher les formations couvertes, et UN SEUL document est créé pour toutes :
 *   · stagiaire → `enrollment_ids` = les inscriptions cochées (prepareLearnerDoc les lie toutes) ;
 *   · entreprise → `createCompanyDocument({ session_ids })` (il réunit les sessions en un document).
 *
 * Le serveur savait déjà faire (prepareLearnerDoc lie tous les enrollmentIds ; createCompanyDocument
 * accepte session_ids) : ces tests gèlent le CÂBLAGE de l'écran, lu au source (composants React).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');

test('la fenêtre de choix des formations existe et rend les sessions cochées', () => {
    const m = lire('components/ImportSessionsModal.jsx');
    assert.match(m, /export default function ImportSessionsModal/);
    assert.match(m, /onValider\(\[\.\.\.sel\]\)/, 'elle rend la liste des sessions cochées');
});

test('fiche stagiaire : la fenêtre s\'ouvre pour un document non généré à ≥2 inscriptions', () => {
    const p = lire('pages/StagiaireDetail.jsx');
    assert.match(p, /if \(!step\.piece && !step\.remise && !step\.docId && enrollments\.length > 1\) \{/,
        'seulement un document (ni pièce ni remise) jamais généré, avec plusieurs inscriptions');
    assert.match(p, /setImportMulti\(\{/);
    // Les inscriptions cochées deviennent enrollment_ids (toutes), sinon l'inscription affichée.
    assert.match(p, /fd\.append\("enrollment_ids", JSON\.stringify\(enrIdsImport && enrIdsImport\.length \? enrIdsImport : \[curEnrId\]\)\)/);
    assert.match(p, /<ImportSessionsModal /);
});

test('fiche entreprise : la fenêtre s\'ouvre pour un document de groupe non préparé à ≥2 sessions', () => {
    const e = lire('pages/EntrepriseDetail.jsx');
    assert.match(e, /const eligibles = \(data\.sessions \|\| \[\]\)\.filter\(\(s\) => \(groupTplsBySession\[s\.id\] \|\| \[\]\)\.some\(\(t\) => t\.slug === step\.key\)\);/);
    assert.match(e, /if \(eligibles\.length > 1\) \{/);
    // Les sessions cochées réunies en UN document (session_ids), sinon la session affichée.
    assert.match(e, /createCompanyDocument\(id, \{ session_ids: cible\.sessionIds \|\| \[viewSessionId\], template_slug: cible\.slug \}\)/);
    assert.match(e, /<ImportSessionsModal /);
});
