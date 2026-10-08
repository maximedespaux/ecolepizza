/**
 * LA PASTILLE « MES DOCUMENTS » NE COMPTE PAS LES DOCUMENTS DE GROUPE — ET ON NE LES CONSULTE PAS.
 *
 * L'HISTOIRE. Le 2026-10-08 au matin, on avait fait compter à la pastille les documents de GROUPE
 * (devis, convention, CGV de l'entreprise) « reçus mais jamais vus », la pastille retombant dès que
 * le stagiaire les OUVRAIT (table `document_vu`, migration 204). L'école a TRANCHÉ l'inverse le même
 * jour : ces pièces regardent l'entreprise, le stagiaire n'en voit que le STATUT (fait ou non) dans
 * son parcours, jamais le contenu. Un document qu'on ne peut pas ouvrir ne peut jamais devenir
 * « vu » : la pastille serait restée allumée pour toujours. On l'a donc REVERSÉE.
 *
 * CE QUI EST GELÉ ICI MAINTENANT :
 *   · `pendingDocsCount` ne compte QUE les documents propres du stagiaire (QCM, émargement, à
 *     signer) — plus aucun document de groupe, et `groupeNonVusCount` a disparu ;
 *   · le parcours (`getMyFormation`) marque chaque document « consultable » ou non, et l'écran
 *     affiche un document de groupe en STATUT SEUL, sans bouton « Consulter » ;
 *   · `document_vu` n'est plus ni écrit (getDocument) ni lu : la migration 204 est désormais
 *     INUTILISÉE (son revert, qui supprime la table, est sans risque).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p, f) => fs.readFileSync(path.join(p, f), 'utf8');
const ESPACE = lire(API, 'controllers/espace.controller.js');
const DOC = lire(API, 'controllers/document.controller.js');

/* ─── Serveur : la pastille ne compte QUE ses propres documents ──────────────────────────────── */

test('pendingDocsCount ne compte que les documents propres du stagiaire (pas ceux de groupe)', () => {
    assert.match(ESPACE, /async function pendingDocsCount\(conn, learner, orgId\)/,
        'plus de paramètre userId : on ne regarde plus « ce qu\'il a vu »');
    const z = ESPACE.slice(ESPACE.indexOf('async function pendingDocsCount'), ESPACE.indexOf('async function pendingDocsCount') + 2000);
    assert.match(z, /return aFaire;/, 'à faire SEULEMENT (ses QCM, émargements, documents à signer)');
    assert.doesNotMatch(ESPACE, /groupeNonVusCount/, 'la fonction « documents de groupe non vus » a disparu');
    assert.match(ESPACE, /pendingDocsCount\(conn, learner, learner\.organization_id\)/, 'appelée sans req.user.id');
});

/* ─── Serveur : le parcours marque le consultable, et ne consulte pas les documents de groupe ─── */

test('getMyFormation marque chaque document « consultable » (groupe de l\'entreprise = non)', () => {
    const z = ESPACE.slice(ESPACE.indexOf('const getMyFormation = async'), ESPACE.indexOf('const getMyFormation = async') + 4500);
    // Consultable = son document nominatif OU un document sans company_id (session) ; un document
    // de GROUPE (company_id renseigné) ne l'est pas. Égalité SÛRE vis-à-vis de NULL (`<=>`) : un
    // document de groupe a learner_id NULL, et `learner_id = ?` vaudrait NULL (pas 0) — consultable
    // serait NULL, que l'écran ne reconnaît pas comme « non consultable » (défaut relevé en prod).
    assert.match(z, /\(gd\.company_id IS NULL OR gd\.learner_id <=> \?\) AS consultable/);
    assert.doesNotMatch(z, /gd\.learner_id = \? OR gd\.company_id IS NULL\) AS consultable/,
        'surtout pas `= ?` : renverrait NULL pour un document de groupe');
});

test('le stagiaire ne CONSULTE pas un document de groupe, et « vu » n\'est plus tracé', () => {
    // La règle de lecture écarte les documents d'entreprise (cf. document-groupe-lecture-stagiaire).
    const fn = DOC.slice(DOC.indexOf('async function lecteurDuDocument'), DOC.indexOf('async function lecteurDuDocument') + 1100);
    assert.match(fn, /AND gd\.company_id IS NULL/, 'un document d\'entreprise n\'est pas lisible par le stagiaire');
    // Plus aucune trace « vu » : ni écriture (getDocument), ni lecture (comptage).
    assert.doesNotMatch(DOC, /document_vu/, 'getDocument n\'écrit plus dans document_vu');
    assert.doesNotMatch(ESPACE, /document_vu/, 'le comptage ne lit plus document_vu');
});

/* ─── Écran : un document de groupe s'affiche en statut seul ─────────────────────────────────── */

test('StudentFormationDetail : un document de groupe n\'a pas de bouton « Consulter »', () => {
    const p = lire(UI, 'pages/StudentFormationDetail.jsx');
    // Une branche dédiée aux documents non consultables, AVANT la branche à bouton.
    assert.match(p, /e\.d\.consultable === 0 \|\| e\.d\.consultable === false \|\| e\.d\.consultable === null \?/,
        'un document non consultable (0 / false / null) est traité à part');
    assert.match(p, /Document de votre entreprise/, 'il porte une mention claire, pas un bouton');
    // Le bouton « Consulter » ouvre toujours les AUTRES documents (branche consultable).
    assert.match(p, /onClick=\{\(\) => setViewId\(e\.d\.id\)\}/);
});

/* ─── Écran : la pastille « Mes documents » ──────────────────────────────────────────────────── */

test('la pastille « Mes documents » existe et dit ce qu\'elle compte', () => {
    const l = lire(UI, 'layouts/StudentLayout.jsx');
    assert.match(l, /to="\/mon-espace"/, 'la pastille est sur « Mes documents »');
    // Elle somme ses propres pièces et les documents d'entreprise à SIGNER par le représentant
    // (`docsBadge = pending + repPending`) — repPending est le compte du représentant, pas le
    // stagiaire ordinaire ; « Entreprise » est un onglet de la page.
    assert.match(l, /docsBadge > 0 && <span className="stu-count">\{docsBadge\}<\/span>/, 'elle montre le nombre');
    assert.match(l, /document.*en attente/, 'et dit « en attente »');
});

/* ─── Migration 204 : désormais INUTILISÉE, son revert reste propre ──────────────────────────── */

test('la migration 204 (document_vu) est inutilisée ; son revert supprime la table proprement', () => {
    const dir = path.join(__dirname, '../../../database/migrations');
    const retour = fs.readFileSync(path.join(dir, '204_revert_document_vu.sql'), 'utf8');
    assert.match(retour, /DROP TABLE IF EXISTS document_vu/, 'le revert supprime la table (sans risque : plus personne ne la lit)');
    // Commentaires en BLOCS seulement (CLAUDE.md §2.1), jamais « -- » en tête de ligne.
    assert.doesNotMatch(retour, /^\s*--/m, 'commentaires /* */ seulement');
});
