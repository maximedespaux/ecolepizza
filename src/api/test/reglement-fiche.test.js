/**
 * LES DEUX ROUTES DU RÈGLEMENT (carte de la fiche stagiaire, 2026-09-30) — au-delà du calcul pur
 * (reglement-dossier.test.js), on éprouve ici le contrôleur avec une base SIMULÉE :
 *   · un montant d'acompte illisible est refusé (422) ;
 *   · cocher « payé le… » sans la migration 194 répond 503, pas un plantage ;
 *   · le MONTANT de l'acompte, lui, s'écrit sans la migration (sa colonne préexiste) ;
 *   · avec la migration, la date part bien dans l'UPDATE ;
 *   · GET assemble un dossier et lit son règlement d'après la facture d'acompte payée.
 */
const test = require('node:test');
const assert = require('node:assert');

const ORG = 'org1';
let requetes = [];
let reponses = [];
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();

const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = {
    id: cheminDb, filename: cheminDb, loaded: true, exports: {
        promise: () => ({
            query: async (sql, params) => {
                const q = plat(sql); requetes.push({ q, params });
                const r = reponses.find(([m]) => m.test(q));
                return r ? (typeof r[1] === 'function' ? r[1](q, params) : r[1]) : [[]];
            },
        }),
        // logAudit passe par le mode callback : on le laisse « réussir » sans rien écrire.
        query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
    },
};
const { getReglements, updateReglement } = require('../controllers/learner.controller.js');

const REP_ENR_OK = [/id FROM enrollment WHERE id = \? AND learner_id/, [[{ id: 'e1' }]]];
function faireRes() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    return res;
}
async function patch(body, params = { id: 'l1', enrollmentId: 'e1' }) {
    requetes = [];
    const res = faireRes();
    await updateReglement({ user: { organization_id: ORG, id: 'u1' }, params, body }, res);
    return res;
}

test('MONTANT D\'ACOMPTE ILLISIBLE : refusé (422), rien n\'est écrit', async () => {
    reponses = [REP_ENR_OK];
    const res = await patch({ acompte: 'à peu près 450' });
    assert.strictEqual(res.code, 422);
    assert.ok(!requetes.some((r) => /UPDATE enrollment/.test(r.q)), 'aucun UPDATE');
});

test('DOSSIER INTROUVABLE : 404', async () => {
    reponses = [[/id FROM enrollment WHERE id = \? AND learner_id/, [[]]]];
    const res = await patch({ acompte: '450' }, { id: 'l1', enrollmentId: 'zzz' });
    assert.strictEqual(res.code, 404);
});

test('COCHER « payé le… » SANS LA 194 : 503, et non un plantage', async () => {
    reponses = [REP_ENR_OK, [/information_schema.columns/, [[]]]]; // colonnes absentes
    const res = await patch({ acompte_paye_le: '2026-03-12' });
    assert.strictEqual(res.code, 503);
    assert.match(res.corps.error, /194/);
});

test('LE MONTANT DE L\'ACOMPTE S\'ÉCRIT SANS LA MIGRATION (colonne acompte préexistante)', async () => {
    reponses = [REP_ENR_OK, [/UPDATE enrollment SET/, [[]]]];
    const res = await patch({ acompte: '450,00' });
    assert.strictEqual(res.code, 200);
    const upd = requetes.find((r) => /UPDATE enrollment SET/.test(r.q));
    assert.match(upd.q, /acompte = \?/);
    assert.strictEqual(upd.params[0], '450.00', 'la virgule française est lue, la base reçoit un point et deux décimales');
    // On n'a même pas eu à sonder les colonnes de la 194 : aucune date demandée.
    assert.ok(!requetes.some((r) => /information_schema/.test(r.q)));
});

test('AVEC LA 194 : la date « payé le… » part dans l\'UPDATE', async () => {
    reponses = [REP_ENR_OK, [/information_schema.columns/, [[{ 1: 1 }]]], [/UPDATE enrollment SET/, [[]]]];
    const res = await patch({ solde_paye_le: '2026-06-15' });
    assert.strictEqual(res.code, 200);
    const upd = requetes.find((r) => /UPDATE enrollment SET/.test(r.q));
    assert.match(upd.q, /solde_paye_le = \?/);
    assert.strictEqual(upd.params[0], '2026-06-15');
});

test('UNE DATE MAL FORMÉE : refusée (422)', async () => {
    reponses = [REP_ENR_OK, [/information_schema.columns/, [[{ 1: 1 }]]]];
    const res = await patch({ acompte_paye_le: '12/03/2026' });
    assert.strictEqual(res.code, 422);
});

test('LE MOYEN SANS LA 195 : 503, et non un plantage', async () => {
    reponses = [REP_ENR_OK, [/information_schema.columns/, [[]]]]; // colonnes absentes
    const res = await patch({ acompte_moyen: 'CHEQUE' });
    assert.strictEqual(res.code, 503);
    assert.match(res.corps.error, /195/);
});

test('AVEC LA 195 : le moyen et sa référence partent dans l\'UPDATE', async () => {
    reponses = [REP_ENR_OK, [/information_schema.columns/, [[{ 1: 1 }]]], [/UPDATE enrollment SET/, [[]]]];
    const res = await patch({ acompte_moyen: 'CHEQUE', acompte_ref: ' 12345 ' });
    assert.strictEqual(res.code, 200);
    const upd = requetes.find((r) => /UPDATE enrollment SET/.test(r.q));
    assert.match(upd.q, /acompte_moyen = \?/);
    assert.match(upd.q, /acompte_ref = \?/);
    assert.strictEqual(upd.params[0], 'CHEQUE');
    assert.strictEqual(upd.params[1], '12345', 'la référence est rognée');
});

test('UN MOYEN INCONNU (ni code, ni moyen de l\'entité) : refusé (422)', async () => {
    reponses = [REP_ENR_OK, [/information_schema.columns/, [[{ 1: 1 }]]],
        [/FROM billing_profile/, [[{ payment_methods: 'Espèces,CB,Virement,Chèque' }]]]];
    const res = await patch({ solde_moyen: 'PAYPAL' });
    assert.strictEqual(res.code, 422);
    assert.ok(!requetes.some((r) => /UPDATE enrollment/.test(r.q)), 'aucun UPDATE');
});

test('UN MOYEN CONFIGURÉ SUR L\'ENTITÉ : accepté, enregistré tel quel (« Prélèvement »)', async () => {
    /* Le besoin du 2026-10-06 : la carte propose les moyens de l'entité (Paramètres → Facturation),
       pas seulement les quatre d'origine. Un moyen coché là — ici « Prélèvement » — doit passer, et
       s'écrire LITTÉRALEMENT (la colonne est un varchar, cf. migration 195). */
    reponses = [REP_ENR_OK, [/information_schema.columns/, [[{ 1: 1 }]]],
        [/FROM billing_profile/, [[{ payment_methods: 'Espèces,CB,Prélèvement' }]]],
        [/UPDATE enrollment SET/, [[]]]];
    const res = await patch({ acompte_moyen: 'Prélèvement' });
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    const upd = requetes.find((r) => /UPDATE enrollment SET/.test(r.q));
    assert.match(upd.q, /acompte_moyen = \?/);
    assert.strictEqual(upd.params[0], 'Prélèvement', 'le libellé choisi est enregistré tel quel');
});

test('GET : un dossier, son acompte payé d\'après la facture', async () => {
    reponses = [
        [/id FROM learner WHERE id = \? AND organization_id/, [[{ id: 'l1' }]]],
        [/information_schema.columns/, [[{ 1: 1 }]]],
        [/FROM enrollment e JOIN training_session/, [[{
            enrollment_id: 'e1', enroll_price: null, acompte: 450, acompte_paye_le: null, solde_paye_le: null,
            acompte_moyen: 'CHEQUE', acompte_ref: '12345', solde_moyen: null, solde_ref: null,
            program_title: 'CAP Pizzaïolo', program_code: 'RS7404', tarif: '1500.00', year: 2026, week: 12,
        }]]],
        [/FROM invoice i/, [[{ numero: 'ACPT-1', type: 'ACOMPTE', statut: 'PAYEE', montant: '450.00', paye: '450.00', dernier_paiement: '2026-03-12' }]]],
        // Les moyens que la carte proposera : ceux de l'entité émettrice (Paramètres → Facturation).
        [/FROM billing_profile/, [[{ payment_methods: 'Espèces,CB,Virement,Chèque,Prélèvement' }]]],
    ];
    const res = faireRes();
    await getReglements({ user: { organization_id: ORG }, params: { id: 'l1' } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    // La réponse porte la liste PROPOSÉE, reprise de l'entité — c'est elle que le sélecteur affiche.
    assert.deepStrictEqual(res.corps.moyens, ['Espèces', 'CB', 'Virement', 'Chèque', 'Prélèvement']);
    const d = res.corps.data[0];
    assert.strictEqual(d.acompte.paye, true);
    assert.strictEqual(d.acompte.source, 'facture');
    assert.strictEqual(d.acompte.date, '2026-03-12');
    assert.strictEqual(d.reste, 1050);
    assert.strictEqual(d.solde.paye, false);
    assert.strictEqual(d.migration_194, true);
    // Le moyen de paiement (195) remonte jusqu'à la carte, séparément acompte / solde.
    assert.strictEqual(d.migration_195, true);
    assert.strictEqual(d.acompte.moyen, 'CHEQUE');
    assert.strictEqual(d.acompte.ref, '12345');
    assert.strictEqual(d.solde.moyen, null);
});
