// Tests unitaires du calcul de parcours documentaire d'un dossier. Sans base.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeDocParcours } = require('../lib/parcours.js');

test('computeDocParcours : doc non-signable « fait » à l\'envoi, étape suivante « en cours »', () => {
  const steps = [
    { slug: 'devis', doc_type: 'DEVIS', stagiaire_sign: false, label: 'Devis' },
    { slug: 'contrat', doc_type: 'CONTRAT', stagiaire_sign: true, label: 'Contrat' },
  ];
  const docs = [{ template_slug: 'devis', type: 'DEVIS', status: 'ENVOYE' }];
  const parc = computeDocParcours({ steps, docs });
  assert.equal(parc.steps.length, 2);
  assert.equal(parc.steps[0].status, 'done');     // envoyé + non signable → fait
  assert.equal(parc.steps[1].status, 'current');  // contrat à signer, pas encore généré
  assert.equal(parc.percent, 50);
  assert.equal(parc.currentKey, 'contrat');
});

test('computeDocParcours : doc à signer « fait » seulement une fois SIGNÉ', () => {
  const steps = [{ slug: 'contrat', doc_type: 'CONTRAT', stagiaire_sign: true, label: 'Contrat' }];
  assert.equal(computeDocParcours({ steps, docs: [{ template_slug: 'contrat', status: 'ENVOYE' }] }).steps[0].status, 'current');
  assert.equal(computeDocParcours({ steps, docs: [{ template_slug: 'contrat', status: 'SIGNE' }] }).steps[0].status, 'done');
});

test('computeDocParcours : parcours vide → 0 %', () => {
  const parc = computeDocParcours({ steps: [], docs: [] });
  assert.equal(parc.percent, 0);
  assert.equal(parc.currentKey, null);
});
