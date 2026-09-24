/**
 * COMPLÉTION UNIFIÉE POUR UN COMPTE À DEUX CASQUETTES (demandé le 2026-09-24).
 *
 * Un compte peut être À LA FOIS stagiaire ET représentant de l'entreprise du dossier. Ses documents
 * de GROUPE (🏢) qu'il signe en tant qu'entreprise entrent dans la MÊME progression que ses
 * documents de stagiaire — mais seulement si l'entreprise du dossier est rattachée à son compte.
 *
 * LE DÉFAUT « 4/8 », GELÉ ICI. On adossait chaque étape à un document par le `doc_type`. Or plusieurs
 * modèles partagent un type : QUATRE « DEVIS » (devis-particulier, devis-professionnel, devis-rs7404,
 * devis-professionnel-copie). Un seul devis signé cochait donc les QUATRE étapes DEVIS du parcours.
 * On adosse désormais par le `template_slug`, unique : la signature ne compte que pour SON étape.
 */
const test = require('node:test');
const assert = require('node:assert');
const { completionOf } = require('../controllers/espace.controller.js');

// completionOf ne fait qu'UNE requête (les documents du dossier) ; le mock la sert quel que soit le SQL.
const conn = (docs) => ({ query: async () => [docs] });
// Une étape : slug UNIQUE, doc_type éventuellement PARTAGÉ avec d'autres.
const stag = (slug, type) => ({ active: 1, applies_when: {}, slug, doc_type: type || slug.toUpperCase(), sort_order: 1, stagiaire_sign: 1, company_sign: 0, signable: 1 });
const groupe = (slug, type) => ({ active: 1, applies_when: {}, slug, doc_type: type || slug.toUpperCase(), sort_order: 2, stagiaire_sign: 0, company_sign: 1, company_level: 1, signable: 1 });
const dossier = { enrollment_id: 'e1', company_id: 'c1', end_date: null, program_days: 1 };

test('un document signé ne coche QUE son étape (par slug), pas les étapes de même type', async () => {
    // Quatre étapes de type DEVIS, slugs distincts ; UN seul document signé (devis-professionnel-copie).
    const steps = [
        stag('devis-particulier', 'DEVIS'), stag('devis-professionnel', 'DEVIS'), stag('devis-rs7404', 'DEVIS'),
        groupe('devis-professionnel-copie', 'DEVIS'),
    ];
    const c = await completionOf(conn([{ template_slug: 'devis-professionnel-copie', status: 'SIGNE' }]), dossier, steps, false, ['c1']);
    assert.deepStrictEqual([c.signed, c.total], [1, 4], 'un seul devis signé compte 1, pas 4 (le défaut « 4/8 »)');
});

test('stagiaire ordinaire : SEULES ses étapes comptent (rien ne change)', async () => {
    const c = await completionOf(conn([{ template_slug: 'droit-image', status: 'SIGNE' }, { template_slug: 'convention-groupe', status: 'SIGNE' }]),
        dossier, [stag('droit-image'), stag('certif'), groupe('convention-groupe')], false, []); // repCompanyIds vide
    assert.deepStrictEqual([c.signed, c.total], [1, 2], 'le document de groupe (même signé) ne rentre pas pour un stagiaire ordinaire');
});

test('à deux casquettes : un document de groupe NON signé gonfle le total, pas le signé', async () => {
    const c = await completionOf(conn([{ template_slug: 'droit-image', status: 'SIGNE' }, { template_slug: 'devis-pro', status: 'ENVOYE' }, { template_slug: 'convention', status: 'ENVOYE' }]),
        dossier, [stag('droit-image'), groupe('devis-pro'), groupe('convention')], false, ['c1']);
    assert.deepStrictEqual([c.signed, c.total], [1, 3], 'un seul signé — les deux documents de groupe restent À FAIRE');
});

test('à deux casquettes : un document de groupe signé avance la même barre', async () => {
    const c = await completionOf(conn([{ template_slug: 'droit-image', status: 'SIGNE' }, { template_slug: 'devis-pro', status: 'SIGNE' }, { template_slug: 'convention', status: 'ENVOYE' }]),
        dossier, [stag('droit-image'), groupe('devis-pro'), groupe('convention')], false, ['c1']);
    assert.deepStrictEqual([c.signed, c.total], [2, 3]);
});
