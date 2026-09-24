/**
 * COMPLÉTION UNIFIÉE POUR UN COMPTE À DEUX CASQUETTES (demandé le 2026-09-24, corrigé le même jour).
 *
 * Un compte peut être À LA FOIS stagiaire ET représentant de l'entreprise du dossier (même personne,
 * cf. rep.routes). Sur sa page stagiaire, l'anneau ne comptait QUE ses documents de stagiaire ; les
 * documents de GROUPE de son parcours (🏢), qu'il signe EN TANT QU'ENTREPRISE, restaient dehors.
 *
 * LA PREMIÈRE VERSION GONFLAIT LA BARRE : elle comptait les documents de groupe par une requête large
 * (toute l'entreprise + la session), qui ramassait ceux d'autres groupes/OPCO — « signé 4/7 » pour
 * un seul document réellement signé. On compte désormais les ÉTAPES DU PARCOURS (bornées, chacune
 * adossée à son document par le type), jamais une requête large.
 */
const test = require('node:test');
const assert = require('node:assert');
const { completionOf } = require('../controllers/espace.controller.js');

// completionOf ne fait qu'UNE requête (les documents du dossier) ; le mock la sert quel que soit le SQL.
const conn = (docs) => ({ query: async () => [docs] });
const stag = (type) => ({ active: 1, applies_when: {}, slug: type.toLowerCase(), doc_type: type, label: type, sort_order: 1, stagiaire_sign: 1, company_sign: 0, signable: 1 });
const groupe = (type) => ({ active: 1, applies_when: {}, slug: type.toLowerCase(), doc_type: type, label: type, sort_order: 2, stagiaire_sign: 0, company_sign: 1, company_level: 1, signable: 1 });
const dossier = { enrollment_id: 'e1', company_id: 'c1', end_date: null, program_days: 1 };

test('stagiaire ordinaire : SEULES ses étapes comptent (rien ne change)', async () => {
    const c = conn([{ type: 'DROIT_IMAGE', status: 'SIGNE' }, { type: 'CERTIF', status: 'ENVOYE' }, { type: 'CONVENTION', status: 'SIGNE' }]);
    const r = await completionOf(c, dossier, [stag('DROIT_IMAGE'), stag('CERTIF'), groupe('CONVENTION')], false, []);
    assert.deepStrictEqual([r.signed, r.total], [1, 2], 'le document de groupe (même signé) ne rentre pas pour un stagiaire ordinaire');
});

test('à deux casquettes : un document de groupe NON signé gonfle le total, pas le signé', async () => {
    // 1 document stagiaire signé ; 2 documents de groupe ENVOYÉS (pas encore signés par le représentant).
    const c = conn([{ type: 'DROIT_IMAGE', status: 'SIGNE' }, { type: 'DEVIS', status: 'ENVOYE' }, { type: 'CONVENTION', status: 'ENVOYE' }]);
    const r = await completionOf(c, dossier, [stag('DROIT_IMAGE'), groupe('DEVIS'), groupe('CONVENTION')], false, ['c1']);
    assert.deepStrictEqual([r.signed, r.total], [1, 3], 'un seul signé — les deux documents de groupe restent À FAIRE');
});

test('à deux casquettes : un document de groupe signé avance la même barre', async () => {
    const c = conn([{ type: 'DROIT_IMAGE', status: 'SIGNE' }, { type: 'DEVIS', status: 'SIGNE' }, { type: 'CONVENTION', status: 'ENVOYE' }]);
    const r = await completionOf(c, dossier, [stag('DROIT_IMAGE'), groupe('DEVIS'), groupe('CONVENTION')], false, ['c1']);
    assert.deepStrictEqual([r.signed, r.total], [2, 3]);
});

test('la barre est BORNÉE au parcours : un document de groupe hors parcours ne compte pas (le défaut « 4/7 »)', async () => {
    // statusByType ne connaît que les documents DU DOSSIER ; un document de groupe qui n'est pas une
    // étape du parcours (AUTRE_GROUPE) ne peut pas gonfler la barre — c'est ce que la requête large faisait.
    const c = conn([{ type: 'DROIT_IMAGE', status: 'SIGNE' }, { type: 'AUTRE_GROUPE', status: 'SIGNE' }]);
    const r = await completionOf(c, dossier, [stag('DROIT_IMAGE'), groupe('DEVIS')], false, ['c1']);
    assert.deepStrictEqual([r.signed, r.total], [1, 2], 'DEVIS reste à faire ; AUTRE_GROUPE, hors parcours, est ignoré');
});
