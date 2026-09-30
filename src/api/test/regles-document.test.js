/**
 * LES RÈGLES D'E-MAIL DÉCLENCHÉES PAR UN DOCUMENT (migration 196) — lib/reglesDocument.js.
 *
 * On éprouve la règle PURE : à quel document une règle s'applique (modèle, stagiaire, entreprise,
 * formation), et à qui part le message. Le crochet du contrôleur et l'envoi sont testés à part.
 */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../lib/reglesDocument.js');

test('LES DÉCLENCHEURS D\'ÉVÉNEMENT : envoyé et signé, reconnus ; les autres non', () => {
    assert.ok(R.estDeclencheurDoc('document_envoye'));
    assert.ok(R.estDeclencheurDoc('document_signe'));
    assert.strictEqual(R.estDeclencheurDoc('fin_session'), false, 'un déclencheur de date n\'est pas un événement de document');
    assert.strictEqual(R.estDeclencheurDoc('document_supprime'), false);
    assert.strictEqual(R.DECLENCHEURS_DOC.document_signe.etat, 'SIGNE');
    assert.strictEqual(R.DECLENCHEURS_DOC.document_envoye.etat, 'ENVOYE');
});

test('LE CIBLAGE : chaque filtre renseigné doit correspondre ; un filtre absent laisse passer', () => {
    const doc = { template_slug: 'convention', learner_id: 'l1', company_id: 'c1', program_id: 'p1' };
    // Règle sans filtre : vise tout document.
    assert.ok(R.regleViseDocument({}, doc));
    // Filtre modèle.
    assert.ok(R.regleViseDocument({ template_slug: 'convention' }, doc));
    assert.strictEqual(R.regleViseDocument({ template_slug: 'contrat' }, doc), false, 'un autre modèle ne déclenche pas');
    // Filtre stagiaire.
    assert.ok(R.regleViseDocument({ learner_id: 'l1' }, doc));
    assert.strictEqual(R.regleViseDocument({ learner_id: 'l2' }, doc), false);
    // Filtre entreprise.
    assert.ok(R.regleViseDocument({ company_id: 'c1' }, doc));
    assert.strictEqual(R.regleViseDocument({ company_id: 'c2' }, doc), false);
    // Filtre formation.
    assert.strictEqual(R.regleViseDocument({ program_id: 'p2' }, doc), false);
    // Tous ensemble : il faut que TOUT corresponde.
    assert.ok(R.regleViseDocument({ template_slug: 'convention', learner_id: 'l1', company_id: 'c1', program_id: 'p1' }, doc));
    assert.strictEqual(R.regleViseDocument({ template_slug: 'convention', learner_id: 'l2' }, doc), false, 'un seul filtre qui rate suffit à écarter');
});

test('LES DESTINATAIRES : stagiaire, entreprise, ou les deux — une adresse manquante est écartée', () => {
    const emails = { stagiaireEmail: 's@ex.fr', entrepriseEmail: 'e@ex.fr' };
    assert.deepStrictEqual(R.destinatairesDe({ destinataire: 'stagiaire' }, emails), [{ type: 'stagiaire', email: 's@ex.fr' }]);
    assert.deepStrictEqual(R.destinatairesDe({ destinataire: 'entreprise' }, emails), [{ type: 'entreprise', email: 'e@ex.fr' }]);
    assert.deepStrictEqual(R.destinatairesDe({ destinataire: 'stagiaire_entreprise' }, emails),
        [{ type: 'stagiaire', email: 's@ex.fr' }, { type: 'entreprise', email: 'e@ex.fr' }]);
    // Une entreprise sans espace (pas d'adresse) : « les deux » ne part qu'au stagiaire, jamais à vide.
    assert.deepStrictEqual(R.destinatairesDe({ destinataire: 'stagiaire_entreprise' }, { stagiaireEmail: 's@ex.fr', entrepriseEmail: null }),
        [{ type: 'stagiaire', email: 's@ex.fr' }]);
    assert.deepStrictEqual(R.destinatairesDe({ destinataire: 'entreprise' }, { stagiaireEmail: 's@ex.fr', entrepriseEmail: null }), [],
        'entreprise sans adresse : aucun envoi, plutôt qu\'au stagiaire par erreur');
});

test('destinataireValide : les trois valeurs connues, rien d\'autre', () => {
    for (const d of ['stagiaire', 'entreprise', 'stagiaire_entreprise']) assert.ok(R.destinataireValide(d));
    assert.strictEqual(R.destinataireValide('ecole'), false);
    assert.strictEqual(R.destinataireValide(''), false);
});
