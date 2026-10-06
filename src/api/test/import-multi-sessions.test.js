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

test('fiche stagiaire : une formation qui a DÉJÀ le document n\'est plus reproposée (2026-10-06)', () => {
    const p = lire('pages/StagiaireDetail.jsx');
    /* LAMBERT Sylvain, NIV1 en S6 déjà faite, NIV2 en S25 à faire : on ne demande plus « pour les
       deux ? ». Les documents portent les inscriptions qu'ils couvrent (enrollment_ids) ; on exclut
       celles qui tiennent déjà ce document (même modèle, ou même QCM), le dossier courant mis à part. */
    assert.match(p, /function dossierADejaLEtape\(enrollmentId, step\)/);
    assert.match(p, /\(d\.enrollment_ids \|\| \[\]\)\.includes\(enrollmentId\)/);
    assert.match(p, /key\.startsWith\("quiz:"\) \? d\.quiz_id === key\.slice\(5\) : d\.template_slug === key/);
    assert.match(p, /function dossiersAProposer\(step\)/);
    assert.match(p, /enrollments\.filter\(\(e\) => e\.id === curEnrId \|\| !dossierADejaLEtape\(e\.id, step\)\)/);
    // La fenêtre ne s'ouvre QUE s'il reste plus d'un dossier à servir ; sinon import / marquage direct.
    assert.strictEqual((p.match(/const dispo = dossiersAProposer\(step\);/g) || []).length, 2, 'import ET marquer-fait');
    assert.strictEqual((p.match(/if \(dispo\.length > 1\) \{/g) || []).length, 2);
    // Les documents reçus portent la liste de leurs inscriptions, ramenée en tableau.
    assert.match(p, /enrollment_ids: String\(d\.enrollment_ids \|\| ""\)\.split\(","\)\.filter\(Boolean\)/);
    // Côté serveur, listDocuments rend bien cette liste.
    const d = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    assert.match(d, /GROUP_CONCAT\(DISTINCT df\.enrollment_id\) AS enrollment_ids/);
});

test('fiche entreprise : la fenêtre s\'ouvre pour un document de groupe non préparé à ≥2 sessions', () => {
    const e = lire('pages/EntrepriseDetail.jsx');
    assert.match(e, /const eligibles = \(data\.sessions \|\| \[\]\)\.filter\(\(s\) => \(groupTplsBySession\[s\.id\] \|\| \[\]\)\.some\(\(t\) => t\.slug === step\.key\)\);/);
    assert.match(e, /if \(eligibles\.length > 1\) \{/);
    // Les sessions cochées réunies en UN document (session_ids), sinon la session affichée.
    assert.match(e, /createCompanyDocument\(id, \{ session_ids: cible\.sessionIds \|\| \[viewSessionId\], template_slug: cible\.slug \}\)/);
    assert.match(e, /<ImportSessionsModal /);
});
