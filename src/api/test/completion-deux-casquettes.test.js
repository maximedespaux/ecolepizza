/**
 * COMPLÉTION UNIFIÉE POUR UN COMPTE À DEUX CASQUETTES (demandé le 2026-09-24).
 *
 * Un compte peut être À LA FOIS stagiaire ET représentant de l'entreprise du dossier (même
 * personne, cf. rep.routes). Sur sa page stagiaire, l'anneau de progression ne comptait QUE ses
 * documents de stagiaire : les documents de GROUPE qu'il signe EN TANT QU'ENTREPRISE restaient
 * dehors, si bien qu'il pouvait rester à 50 % alors qu'il avait fait sa part. Désormais, quand
 * l'entreprise du dossier est rattachée à son compte, ce qu'il y signe entre dans la MÊME barre.
 *
 * On appelle le VRAI `completionOf` avec des requêtes simulées : le document du stagiaire d'un côté,
 * les documents de groupe (scope=COMPANY) de l'autre.
 */
const test = require('node:test');
const assert = require('node:assert');
const { completionOf } = require('../controllers/espace.controller.js');

function fakeConn({ stagiaire = [], company = [] }) {
    return {
        query: async (sql) => {
            const q = String(sql).replace(/\s+/g, ' ');
            if (/scope = 'COMPANY'/.test(q)) return [company];          // documents de groupe
            if (/df\.enrollment_id = \?/.test(q)) return [stagiaire];   // documents du stagiaire
            return [[]];
        },
    };
}
// Une étape de parcours signée par le stagiaire (matchStep passe sur un applies_when vide).
const step = (type) => ({ active: 1, applies_when: {}, slug: type.toLowerCase(), doc_type: type, label: type, sort_order: 1, signable: 1, stagiaire_sign: 1 });
const dossier = { enrollment_id: 'e1', company_id: 'c1', session_id: 's1', end_date: null, program_days: 1 };

test('sans casquette entreprise : SEULS les documents du stagiaire comptent (rien ne change)', async () => {
    const conn = fakeConn({ stagiaire: [{ type: 'CONTRAT', status: 'SIGNE' }], company: [{ status: 'SIGNE' }, { status: 'ENVOYE' }] });
    const c = await completionOf(conn, dossier, [step('CONTRAT')], false, []); // repCompanyIds vide
    assert.deepStrictEqual([c.signed, c.total], [1, 1], 'le stagiaire ordinaire ne voit pas les documents de l\'entreprise');
});

test('avec la casquette entreprise : les documents de groupe entrent dans la même barre', async () => {
    const conn = fakeConn({ stagiaire: [{ type: 'CONTRAT', status: 'SIGNE' }], company: [{ status: 'SIGNE' }, { status: 'ENVOYE' }] });
    // 'c1' (entreprise du dossier) est rattachée au compte → +2 documents de groupe, dont 1 signé.
    const c = await completionOf(conn, dossier, [step('CONTRAT')], false, ['c1']);
    assert.deepStrictEqual([c.signed, c.total], [2, 3], 'un document signé en tant qu\'entreprise avance la même progression');
});

test('une entreprise NON rattachée au compte ne compte pas (garde par les données)', async () => {
    const conn = fakeConn({ stagiaire: [{ type: 'CONTRAT', status: 'SIGNE' }], company: [{ status: 'SIGNE' }] });
    // Le compte représente 'autre', pas 'c1' (l'entreprise du dossier) : on ne mélange pas.
    const c = await completionOf(conn, dossier, [step('CONTRAT')], false, ['autre']);
    assert.deepStrictEqual([c.signed, c.total], [1, 1]);
});
