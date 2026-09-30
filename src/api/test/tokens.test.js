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

test('une valeur en PUCE s\'imprime telle qu\'on l\'a tapée : « $& », « $\' », « $$ » ne sont pas des motifs', () => {
  /* Relevé le 2026-09-30. La valeur d'une puce passait à `replace` en chaîne de remplacement, qui y
     lit `$&` (la puce elle-même), `$'` (ce qui la suit), « $` » (ce qui la précède), `$$` (un seul
     « $ »). La forme {Clé} passait déjà par une fonction : le test ci-dessus ne pouvait pas le voir. */
  const puce = '<span data-token="Nom">Nom</span>';
  for (const [tape, imprime] of [
    ['Lot $& X', 'Lot $&amp; X'],
    ['A $$ B', 'A $$ B'],
    ['Fin $\' ici', 'Fin $\' ici'],
    ['Début $` ici', 'Début $` ici'],
  ]) {
    assert.equal(expandGroupBlocks(`<p>{#Stagiaires}${puce}<br>{/Stagiaires}</p>`, [{ last_name: tape }]), `<p>${imprime}<br></p>`, tape);
  }
  // La conséquence, au rendu : « $& » réinsérait la puce, que la passe globale remplissait avec le
  // stagiaire DU DOSSIER — la ligne d'un stagiaire du groupe imprimait le nom d'un autre.
  const out = fillHtml(`<p>{#Stagiaires}${puce}<br>{/Stagiaires}</p>`, { groupStagiaires: [{ last_name: 'Lot $& X' }], learner: { last_name: 'DOSSIER' } });
  assert.equal(out, '<p>Lot $&amp; X<br></p>');
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

test('fillHtml : un jeton perso QUI EST un bloc, appelé en PUCE, s\'insère tel qu\'on l\'a écrit — « $ » compris', () => {
  /* Relevé le 2026-09-30. Son modèle s'insérait dans le document en chaîne de remplacement, où
     `replace` lit `$$` (un seul « $ »), `$'` (toute la SUITE du document), « $` » (tout son début)
     et `$&` (la puce, remplie ensuite avec le stagiaire DU DOSSIER). Seule la puce y était exposée :
     la forme {custom:clé} du test ci-dessus passe par split/join. */
  const doc = '<p>Avant</p><p><span data-token="custom:liste">liste</span></p><p>Après</p>';
  for (const debut of ['Tarif 10 $$ :', 'Lot $& :', 'Fin $\' :', 'Début $` :']) {
    const ctx = {
      groupStagiaires: [{ last_name: 'DUPONT' }], learner: { last_name: 'DOSSIER' },
      customTokens: [{ token_key: 'liste', template: `${debut} {#Stagiaires}{Nom}<br>{/Stagiaires}` }],
    };
    assert.equal(fillHtml(doc, ctx), `<p>Avant</p><p>${debut} DUPONT<br></p><p>Après</p>`, debut);
  }
});
