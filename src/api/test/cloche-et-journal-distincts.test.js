/**
 * LA CLOCHE ÉTAIT UN SECOND JOURNAL D'AUDIT.
 *
 * LES DEUX ÉCRANS LISENT LA MÊME TABLE. `audit_log` alimente le journal (cent dernières
 * actions, cherchables) ET l'activité de la cloche. Sans règle pour les séparer, la cloche n'en
 * était qu'un exemplaire plus court et moins consultable, et l'on ne savait pas lequel ouvrir.
 *
 * RELEVÉ EN PRODUCTION, ce que la cloche annonçait : « Produit partenaire modifié », « Produit
 * partenaire supprimé », à côté de « Document envoyé » et « Pièce déposée ». Personne n'a
 * besoin d'un carillon pour apprendre qu'un tarif de catalogue a bougé.
 *
 * LA RÈGLE RETENUE. La cloche répond à « quelque chose a bougé dans un DOSSIER, dois-je
 * agir ? ». Le journal répond à « que s'est-il passé, exactement, et qui l'a fait ? ». Régler
 * l'outil — modèles, types de pièces, tarifs partenaires, paramètres, rôles — se retrouve, ça
 * ne se signale pas.
 *
 * LE TRI PAR AUTEUR A ÉTÉ ÉCARTÉ, quoique plus élégant : sur les cent dernières lignes du
 * journal, les cent venaient de trois membres du personnel. Une cloche muette pour tout ce que
 * fait un collègue serait vide dans une école de trois personnes.
 *
 * ET LA DISTINCTION EST ÉCRITE À L'ÉCRAN. Une règle que seul le code connaît ne sépare rien
 * pour qui regarde : chaque page dit désormais ce qu'elle est, et la cloche mène au journal.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { estEvenement, ENTITES_REGLAGE, SECTION_PAR_ENTITE } = require('../lib/activite.js');

const RACINE = path.join(__dirname, '..', '..');
const NOTIF = fs.readFileSync(path.join(__dirname, '..', 'controllers/notification.controller.js'), 'utf8');
const PAGE_NOTIF = fs.readFileSync(path.join(RACINE, 'app/ui/pages/Notifications.jsx'), 'utf8');
const PAGE_AUDIT = fs.readFileSync(path.join(RACINE, 'app/ui/pages/Audit.jsx'), 'utf8');

test('la vie des dossiers sonne', () => {
    for (const e of ['Learner', 'PieceDepot', 'GeneratedDocument', 'Company', 'TrainingSession',
        'AttendanceSheet', 'QuizResponse', 'Invoice', 'CommunityPost']) {
        assert.ok(estEvenement(e), `${e} est un événement : il doit atteindre la cloche`);
    }
});

test('régler l\'outil ne sonne pas', () => {
    for (const e of ['DocumentTemplate', 'PieceType', 'PartnerProduct', 'Organization',
        'AccessProfile', 'User', 'Quiz', 'EmargementTemplate', 'InventoryItem']) {
        assert.ok(!estEvenement(e), `${e} est un réglage : il appartient au journal seul`);
    }
});

test('le QCM modèle se tait, la RÉPONSE d\'un stagiaire sonne', () => {
    /* La nuance tient en une lettre de nom d'entité, et elle porte tout : modifier un
       questionnaire est un réglage, y répondre est un événement du dossier. */
    assert.ok(!estEvenement('Quiz'));
    assert.ok(estEvenement('QuizResponse'));
});

test('une entité inconnue est traitée comme un réglage', () => {
    /* Le silence est le défaut SÛR : ajouter une entité demain ne doit pas se mettre à sonner
       chez tout le monde par oubli. L'inverse — sonner par défaut — se découvrirait en
       production, sur la cloche de chacun. */
    assert.ok(!estEvenement('EntiteInventeeDemain'));
    assert.ok(!estEvenement(null));
    assert.ok(!estEvenement(''));
});

test('toute entité de réglage est une entité connue', () => {
    /* Une faute de frappe dans la liste des réglages serait invisible : l'entité resterait
       « événement » et continuerait de sonner, sans que rien ne le signale. */
    for (const e of ENTITES_REGLAGE) {
        assert.ok(Object.prototype.hasOwnProperty.call(SECTION_PAR_ENTITE, e),
            `${e} ne figure pas dans SECTION_PAR_ENTITE : nom erroné, ou entité oubliée du menu`);
    }
});

test('les deux filtres de la cloche répondent à deux questions', () => {
    /* L'un dit ce qu'on a le DROIT de voir, l'autre ce qui MÉRITE une cloche. Les confondre,
       c'est soit sonner pour des réglages, soit faire fuiter ce qu'on n'a pas le droit de lire. */
    assert.match(NOTIF, /const visibles = entitesVisibles\(sectionsVisibles\(/);
    assert.match(NOTIF, /\.filter\(estEvenement\)/,
        'le filtre « événement » doit s\'appliquer en plus du filtre d\'accès');
});

test('chaque écran dit ce qu\'il est, et la cloche mène au journal', () => {
    assert.match(PAGE_NOTIF, /lead="Ce qui bouge dans les dossiers/,
        'la page Notifications doit annoncer sa raison d\'être');
    assert.match(PAGE_AUDIT, /lead="La trace complète/,
        'la page Journal doit annoncer la sienne');
    assert.match(PAGE_NOTIF, /navigate\("\/audit"\)/, 'un chemin doit relier la cloche au journal');
    assert.match(PAGE_NOTIF, /'AUDITEUR'\]\.includes\(user\?\.role\)/,
        'le lien ne doit paraître qu\'à qui peut ouvrir le journal');
});
