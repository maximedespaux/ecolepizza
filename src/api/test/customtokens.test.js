// Tests unitaires des jetons personnalisés (calcul + décalage de date). Sans base.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { applyTemplate, shiftDate, resolveCustomTokens } = require('../lib/customtokens.js');

test('applyTemplate remplace les références connues, laisse le texte', () => {
  assert.equal(applyTemplate('du {a} au {b}', { a: 'lun', b: 'ven' }), 'du lun au ven');
  assert.equal(applyTemplate('{inconnu}', {}), ''); // référence inconnue → vide
});

test('shiftDate décale une date JJ/MM/AAAA', () => {
  assert.equal(shiftDate('01/01/2026', 1), '02/01/2026');
  assert.equal(shiftDate('01/03/2026', -1), '28/02/2026');
  assert.equal(shiftDate('pas une date', 3), 'pas une date'); // inchangé si non-date
});

test('applyTemplate applique le décalage de date {clé|±N}', () => {
  assert.equal(applyTemplate('{d|+30}', { d: '01/01/2026' }), '31/01/2026');
});

test('resolveCustomTokens : un jeton perso peut en référencer un autre (chaînage)', () => {
  const defs = [
    { token_key: 'a', template: 'X' },
    { token_key: 'b', template: '{custom:a}Y' },
  ];
  const out = resolveCustomTokens(defs, {});
  assert.equal(out['custom:a'], 'X');
  assert.equal(out['custom:b'], 'XY');
});

test('resolveCustomTokens : liste vide → objet vide', () => {
  assert.deepEqual(resolveCustomTokens([], { a: 1 }), {});
});
