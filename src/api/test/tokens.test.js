// Tests unitaires du moteur de jetons (aucune base de données requise).
// Lancer : `npm test` dans src/api (utilise le runner intégré `node --test`).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { expandGroupBlocks, stagiaireRowTokens } = require('../lib/tokens.js');
const { fillHtml } = require('../lib/htmlfill.js');

const GROUP = [
  { civility: 'M.', first_name: 'Jean', last_name: 'DUPONT', opco: 'OCAPIAT', email: 'jean@ex.fr' },
  { civility: 'Mme', first_name: 'Marie', last_name: 'MARTIN', opco: 'AKTO', email: 'marie@ex.fr' },
];

test('expandGroupBlocks répète le bloc pour chaque stagiaire et résout les jetons', () => {
  const out = expandGroupBlocks('<p>{#Stagiaires}{N°}. {Personne} — {OPCO}<br>{/Stagiaires}</p>', GROUP);
  assert.match(out, /1\. M\. Jean DUPONT — OCAPIAT/);
  assert.match(out, /2\. Mme Marie MARTIN — AKTO/);
});

test('expandGroupBlocks liste vide → message par défaut', () => {
  const out = expandGroupBlocks('{#Stagiaires}{Nom}{/Stagiaires}', []);
  assert.match(out, /Aucun stagiaire/);
});

test('SÉCURITÉ : les valeurs par stagiaire sont échappées (anti-XSS)', () => {
  const evil = [{ civility: 'M.', first_name: 'x', last_name: '<img src=x onerror=alert(1)>', opco: '' }];
  const out = expandGroupBlocks('{#Stagiaires}{Nom}{/Stagiaires}', evil);
  assert.ok(!out.includes('<img src=x'), 'la balise brute ne doit pas apparaître');
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('jetons hors bloc restent intacts (résolus globalement ensuite)', () => {
  const out = expandGroupBlocks('{#Stagiaires}{Nom}{/Stagiaires} — {Formation}', GROUP);
  assert.match(out, /\{Formation\}$/); // laissé pour le passage global
});

test('stagiaireRowTokens expose les champs attendus', () => {
  const t = stagiaireRowTokens({ civility: 'M.', first_name: 'Jean', last_name: 'DUPONT', opco: 'OCAPIAT' }, 0);
  assert.equal(t['N°'], '1');
  assert.equal(t.Personne, 'M. Jean DUPONT');
  assert.equal(t.OPCO, 'OCAPIAT');
});

test('fillHtml : jeton perso recalculé PAR stagiaire dans un bloc', () => {
  const ctx = { groupStagiaires: GROUP, customTokens: [{ token_key: 'ligne', template: '{Personne} <{Email}>' }] };
  const out = fillHtml('<p>{#Stagiaires}{custom:ligne}<br>{/Stagiaires}</p>', ctx);
  assert.match(out, /M\. Jean DUPONT &lt;jean@ex\.fr&gt;/);
  assert.match(out, /Mme Marie MARTIN &lt;marie@ex\.fr&gt;/);
});

test('fillHtml : un jeton perso QUI EST un bloc est développé quand on le référence', () => {
  const ctx = {
    groupStagiaires: GROUP,
    customTokens: [{ token_key: 'liste', template: '{#Stagiaires}{N°}. {Personne}<br>{/Stagiaires}' }],
  };
  const out = fillHtml('<p>Participants : {custom:liste}</p>', ctx);
  assert.match(out, /1\. M\. Jean DUPONT/);
  assert.match(out, /2\. Mme Marie MARTIN/);
});
