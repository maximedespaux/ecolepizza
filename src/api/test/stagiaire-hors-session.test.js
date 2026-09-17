/**
 * FICHE STAGIAIRE HORS SESSION — pas de formulaire « Préparer un document ».
 *
 * Constaté en production le 2026-09-17, sur une fiche inscrite à aucune session : « Parcours &
 * documents » proposait quand même de choisir un modèle et de saisir un titre, puis un bouton
 * « Générer le document » grisé pour toujours. Un formulaire qu'on ne peut pas envoyer n'est pas
 * une précaution, c'est une impasse. L'école a demandé qu'il disparaisse.
 *
 * La règle était déjà vraie ailleurs, et c'est ce qui la rend sûre : un document se rattache à un
 * DOSSIER d'inscription (le serveur refuse sans), et un dossier n'existe que dans une session
 * (`enrollment.session_id` est NOT NULL). Sans session, il n'y a rien à générer — seulement une
 * inscription à faire, et c'est elle que l'écran propose désormais.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const FICHE = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/pages/StagiaireDetail.jsx'), 'utf8');
const sansCommentaires = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('hors session, le formulaire n\'est pas rendu : l\'encart d\'inscription le remplace', () => {
    const src = sansCommentaires(FICHE);
    const garde = src.indexOf('{enrollments.length === 0 ? (');
    const encart = src.indexOf('className="sd-hors-session"');
    const sinon = src.indexOf(') : (', encart);
    const formulaire = src.indexOf('<form onSubmit={handlePrepare}');
    assert.ok(garde > -1, 'la garde existe');
    assert.ok(garde < encart && encart < sinon, 'l\'encart est la branche « aucune inscription »');
    assert.ok(sinon < formulaire, 'le formulaire n\'est rendu que dans l\'autre branche');
    // Et il n'existe qu'UN formulaire de préparation : pas de copie restée hors de la garde.
    assert.strictEqual(src.split('<form onSubmit={handlePrepare}').length - 1, 1);
});

test('l\'encart propose le geste qui manque : inscrire depuis une session', () => {
    const src = sansCommentaires(FICHE);
    const encart = src.slice(src.indexOf('className="sd-hors-session"'), src.indexOf('<form onSubmit={handlePrepare}'));
    assert.match(encart, /inscrit à aucune session/);
    assert.match(encart, /navigate\("\/sessions"\)/);
});

test('le serveur refuse déjà un document sans dossier — l\'écran ne fait que le dire', async () => {
    /* Garde AVANT toute requête : la route répond sans base. Si elle venait à accepter un
       document sans dossier, masquer le formulaire ne serait plus qu'un habillage. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    const fn = src.slice(src.indexOf('const createDocument = async'));
    assert.match(fn.slice(0, 400), /enrollment_ids\.length === 0\) \{\s*return res\.status\(422\)/);
    assert.ok(fn.indexOf('enrollment_ids.length === 0') < fn.indexOf('db.promise()'), 'refus avant la base');
});
