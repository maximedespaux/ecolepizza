// Graphe des prérequis de Pizza Quest : détection de cycle et déverrouillage.
//
// Le cycle est le vrai danger : A exige B qui exige A verrouille les DEUX formations pour
// toujours, et rien à l'écran ne le montre — pris un par un, chaque lien paraît sensé. On
// vérifie donc que l'ajout est refusé au moment de poser l'arête, y compris en transitif.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildGraph, allPrerequisites, wouldCycle, resolveUnlocked } = require('../lib/questgraph.js');

// « pour A, il faut B » s'écrit { program_id: 'A', requires_program_id: 'B' }.
const e = (program_id, requires_program_id) => ({ program_id, requires_program_id });

test('buildGraph regroupe les prérequis par formation cible', () => {
    const g = buildGraph([e('expert', 'niv2'), e('expert', 'niv1'), e('niv2', 'niv1')]);
    assert.deepEqual([...g.get('expert')].sort(), ['niv1', 'niv2']);
    assert.deepEqual([...g.get('niv2')], ['niv1']);
    assert.equal(g.get('niv1'), undefined); // aucune exigence
});

test('allPrerequisites remonte toute la chaîne', () => {
    // expert → niv2 → niv1 : l'expert dépend transitivement du niveau I.
    const g = buildGraph([e('expert', 'niv2'), e('niv2', 'niv1')]);
    assert.deepEqual([...allPrerequisites(g, 'expert')].sort(), ['niv1', 'niv2']);
    assert.deepEqual([...allPrerequisites(g, 'niv1')], []);
});

test('allPrerequisites ne boucle pas sur un cycle déjà en base', () => {
    // Un cycle introduit avant ce garde-fou ne doit pas figer le serveur.
    const g = buildGraph([e('a', 'b'), e('b', 'a')]);
    assert.deepEqual([...allPrerequisites(g, 'a')].sort(), ['a', 'b']);
});

test('wouldCycle refuse une formation prérequis d’elle-même', () => {
    assert.equal(wouldCycle([], 'a', 'a'), true);
});

test('wouldCycle refuse le cycle direct', () => {
    // b exige déjà a ; poser « a exige b » boucle.
    assert.equal(wouldCycle([e('b', 'a')], 'a', 'b'), true);
});

test('wouldCycle refuse le cycle transitif', () => {
    // c exige b, b exige a. Poser « a exige c » ferme la boucle a → c → b → a.
    const edges = [e('c', 'b'), e('b', 'a')];
    assert.equal(wouldCycle(edges, 'a', 'c'), true);
});

test('wouldCycle accepte un enchaînement linéaire', () => {
    // niv2 exige niv1 ; ajouter « expert exige niv2 » est parfaitement légitime.
    assert.equal(wouldCycle([e('niv2', 'niv1')], 'expert', 'niv2'), false);
});

test('wouldCycle accepte deux prérequis pour une même formation', () => {
    assert.equal(wouldCycle([e('expert', 'niv1')], 'expert', 'niv2'), false);
});

test('wouldCycle accepte un losange (deux chemins, pas de boucle)', () => {
    // b et c exigent a ; d exige b. Ajouter « d exige c » garde le graphe acyclique.
    const edges = [e('b', 'a'), e('c', 'a'), e('d', 'b')];
    assert.equal(wouldCycle(edges, 'd', 'c'), false);
});

test('resolveUnlocked : sans prérequis, tout est ouvert', () => {
    const m = resolveUnlocked(['a', 'b'], [], []);
    assert.equal(m.get('a').unlocked, true);
    assert.equal(m.get('b').unlocked, true);
});

test('resolveUnlocked : verrouillé tant que le prérequis n’est pas terminé', () => {
    const m = resolveUnlocked(['niv1', 'niv2'], [e('niv2', 'niv1')], []);
    assert.equal(m.get('niv1').unlocked, true);
    assert.equal(m.get('niv2').unlocked, false);
    assert.deepEqual(m.get('niv2').missing, ['niv1']);
});

test('resolveUnlocked : terminer le prérequis ouvre la suite', () => {
    const m = resolveUnlocked(['niv1', 'niv2'], [e('niv2', 'niv1')], ['niv1']);
    assert.equal(m.get('niv2').unlocked, true);
    assert.deepEqual(m.get('niv2').missing, []);
});

test('resolveUnlocked : il faut TOUS les prérequis', () => {
    const edges = [e('expert', 'niv1'), e('expert', 'niv2')];
    const partiel = resolveUnlocked(['expert'], edges, ['niv1']);
    assert.equal(partiel.get('expert').unlocked, false);
    assert.deepEqual(partiel.get('expert').missing, ['niv2']);

    const complet = resolveUnlocked(['expert'], edges, ['niv1', 'niv2']);
    assert.equal(complet.get('expert').unlocked, true);
});

test('resolveUnlocked : seuls les prérequis DIRECTS sont exigés', () => {
    // expert → niv2 → niv1. Avoir terminé niv2 suffit à ouvrir expert : on ne peut pas avoir
    // terminé niv2 sans être passé par niv1, l'exiger à nouveau serait redondant.
    const m = resolveUnlocked(['expert'], [e('expert', 'niv2'), e('niv2', 'niv1')], ['niv2']);
    assert.equal(m.get('expert').unlocked, true);
});
