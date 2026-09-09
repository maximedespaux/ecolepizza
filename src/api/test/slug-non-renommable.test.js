/**
 * LE SLUG D'UN MODÈLE NE SE RENOMME PLUS — retiré le 2026-09-09, à la demande de l'organisme.
 *
 * CE QUI EXISTAIT : `PUT /templates/:slug/rename`, qui répercutait le nouveau slug PARTOUT où il
 * était référencé — parcours (program_step), réglage boutique, factures, documents générés, points
 * de rupture d'émargement, équivalences, et les slugs enfouis dans du JSON. Une cascade de dix
 * requêtes pour renommer un identifiant.
 *
 * POURQUOI C'EST PARTI : un slug est un IDENTIFIANT, sa valeur ne veut rien dire, seule sa
 * stabilité compte. L'intitulé — libre et modifiable, lui — porte déjà tout ce qu'on lit à l'écran.
 * Et une cascade qui rate une référence ne se voit pas le jour du renommage : elle se voit des
 * semaines plus tard, sur un document qui ne se génère plus.
 *
 * CE TEST GÈLE UNE ABSENCE, ce qui est inhabituel et voulu : une fonctionnalité retirée revient
 * facilement « par commodité » (un champ qu'on réactive, une route qu'on remonte). Chacune des
 * trois portes est donc vérifiée fermée — serveur, route, écran — parce qu'il suffit d'une seule
 * rouverte pour que la cascade manquante corrompe des références en silence.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(__dirname, '..', '..', 'app/ui');
const CTRL = fs.readFileSync(path.join(API, 'controllers/template.controller.js'), 'utf8');
const ROUTES = fs.readFileSync(path.join(API, 'routes/template.routes.js'), 'utf8');
const CLIENT = fs.readFileSync(path.join(APP, 'api/apiClient.js'), 'utf8');
const MODELES = fs.readFileSync(path.join(APP, 'pages/Modeles.jsx'), 'utf8');
const LABELS = fs.readFileSync(path.join(APP, 'lib/auditLabels.js'), 'utf8');

test('le serveur n\'expose plus de renommage', () => {
    assert.doesNotMatch(CTRL, /const renameTemplate/, 'la fonction ne doit plus exister');
    assert.doesNotMatch(ROUTES, /rename/, 'la route ne doit plus être montée');
    // La raison reste écrite là où la fonction vivait : sans elle, on la réécrirait.
    assert.match(CTRL, /LE RENOMMAGE DE SLUG A ÉTÉ RETIRÉ/);
});

test('l\'écran n\'a plus de quoi l\'appeler', () => {
    assert.doesNotMatch(CLIENT, /renameTemplate/, 'le client d\'API ne doit plus l\'exposer');
    assert.doesNotMatch(MODELES, /renameTemplate/, 'la page ne doit plus l\'importer ni l\'appeler');
});

test('le champ est saisissable à la CRÉATION, figé ensuite', () => {
    /* Deux blocs distincts, et c'est la moitié qui compte : à la création le slug se choisit
       (il faut bien un identifiant), après quoi le champ passe en lecture seule POUR TOUS les
       modèles — socle comme organisme. Avant, seul le socle était protégé. */
    assert.match(MODELES, /\{!isEmarg && isNew && \(/, 'saisie réservée à la création');
    assert.match(MODELES, /\{!isEmarg && !isNew && \(/, 'affichage figé pour un modèle existant');
    assert.match(MODELES, /<input className="inp mono" value=\{step\.slug\} readOnly disabled \/>/);
    // Et l'enregistrement reprend le slug EXISTANT, il ne le recalcule pas depuis le formulaire.
    assert.match(MODELES, /const slug = isNew \? form\.slug[^:]*: step\.slug;/);
    assert.doesNotMatch(MODELES, /let slug = isNew/, 'plus de réaffectation : le slug ne change plus');
});

test('le libellé d\'audit SURVIT à la fonctionnalité', () => {
    /* Plus aucun code « template.rename » ne sera écrit, mais ceux déjà inscrits au journal le
       restent : une trace d'audit ne se réécrit pas. Supprimer l'entrée rendrait ces lignes-là
       illisibles — exactement ce qu'un journal existe pour empêcher. */
    assert.match(LABELS, /'template\.rename': \['Identifiant de modèle renommé'/);
});
