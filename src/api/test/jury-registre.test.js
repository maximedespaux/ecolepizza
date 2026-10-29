/**
 * COMPOSER LE JURY EN CHOISISSANT DES PERSONNES ENREGISTRÉES (demandé le 2026-10-29).
 *
 * Avant : les membres du jury se tapaient à la main (nom, prénom…) dans `exam_session.jury` (JSON).
 * Désormais on les CHOISIT dans le registre de l'organisme — l'équipe ET les intervenants, qui ont
 * tous un compte. Décidé avec l'école : les externes sont enregistrés comme intervenants, donc tout
 * le jury se choisit dans la même liste. Deux bénéfices : (1) un membre a un compte, donc il pourra
 * SIGNER le PV (tranche suivante) ; (2) comme on sait quelles sessions un intervenant a enseignées,
 * on signale AUTOMATIQUEMENT le conflit « a formé les candidats » (règlement d'examen, art. 6).
 *
 * PAS DE MIGRATION : le jury vit en JSON ; on ajoute seulement `user_id` à l'objet d'un membre.
 * Ces tests gèlent : l'user_id part bien à l'écriture (juryPropre), la liste des personnes est
 * rendue avec le drapeau « a formé cette session », la liste des rôles du jury suit l'équipe, et
 * l'écran choisit dans le registre.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

/* --- Mock de base minimal, partagé par les deux appels réels (saveCommission / getCommission). --- */
let ecrit = null;              // dernière écriture exam_session capturée
let commission = null;         // ligne exam_session existante (null = aucune)
const USERS = [
    { user_id: 'u-form', first_name: 'Paul', last_name: 'Dubois', role: 'INTERVENANT' },
    { user_id: 'u-ext', first_name: 'Hélène', last_name: 'Ferrand', role: 'INTERVENANT' },
    { user_id: 'u-sec', first_name: 'Marie', last_name: 'Albert', role: 'SECRETARIAT' },
];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];               // colonneExiste / OuNull → vrai
            if (/FROM training_session/i.test(sql)) return [[{ id: 's-1', title: 'Titre', rs_code: 'RS7404' }]];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [[{ learner_id: 'l1', first_name: 'Zoé', last_name: 'Martin' }]];
            if (/FROM exam_session/i.test(sql)) return [commission ? [commission] : []];
            if (/FROM exam_result/i.test(sql)) return [[]];
            if (/FROM session_intervenant/i.test(sql)) return [[{ user_id: 'u-form' }]]; // u-form a enseigné cette session
            if (/FROM user\b/i.test(sql)) return [USERS];
            if (/INSERT INTO exam_session|UPDATE exam_session/i.test(sql)) { ecrit = { sql, params }; return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { saveCommission, getCommission } = require('../controllers/examen.controller.js');

function faireRes() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    return res;
}

test('saveCommission conserve l\'user_id du membre choisi (pour sa future signature)', async () => {
    ecrit = null; commission = null;
    const body = {
        pv_ref: 'EPJJD-2026-40', date_examen: '2026-12-18', certification: 'Titre pizzaïolo',
        jury: [{ user_id: 'u-ext', nom: 'Ferrand', prenom: 'Hélène', qualite: 'présidente', externe: true, na_pas_forme: true }],
    };
    const res = faireRes();
    await saveCommission({ user: { organization_id: 'o1', id: 'u1' }, params: { id: 's-1' }, body, headers: {}, ip: '' }, res);
    assert.notStrictEqual(res.code, 500, JSON.stringify(res.corps));
    const p = (ecrit && ecrit.params || []).find((x) => typeof x === 'string' && /^\[/.test(x));
    const juryEcrit = p ? JSON.parse(p) : null;
    assert.ok(juryEcrit, 'une liste de jury a bien été écrite');
    assert.strictEqual(juryEcrit[0].user_id, 'u-ext', 'l\'user_id part à l\'écriture');
    assert.strictEqual(juryEcrit[0].nom, 'Ferrand', 'le nom imprimé reste figé');
    assert.strictEqual(juryEcrit[0].externe, true);
});

test('un membre sans user_id (ancien, saisi à la main) garde user_id null — rien ne casse', async () => {
    ecrit = null; commission = null;
    const body = { pv_ref: 'EPJJD-2026-41', date_examen: '2026-12-18', jury: [{ nom: 'Ferrand Hélène', qualite: 'membre' }] };
    await saveCommission({ user: { organization_id: 'o1', id: 'u1' }, params: { id: 's-1' }, body, headers: {}, ip: '' }, faireRes());
    const p = (ecrit && ecrit.params || []).find((x) => typeof x === 'string' && /^\[/.test(x));
    const juryEcrit = p ? JSON.parse(p) : null;
    assert.strictEqual(juryEcrit[0].user_id, null, 'ancien format : user_id présent et null');
    assert.strictEqual(juryEcrit[0].nom, 'Ferrand Hélène');
});

test('getCommission rend les personnes du registre, avec « a formé cette session »', async () => {
    commission = null;
    const res = faireRes();
    await getCommission({ user: { organization_id: 'o1', id: 'u1' }, params: { id: 's-1' } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    const personnes = res.corps.data.personnes;
    assert.ok(Array.isArray(personnes) && personnes.length === 3, 'les 3 comptes proposables sont rendus');
    const parId = new Map(personnes.map((p) => [p.user_id, p]));
    assert.strictEqual(parId.get('u-form').a_forme, true, 'l\'intervenant qui a enseigné la session est signalé');
    assert.strictEqual(parId.get('u-ext').a_forme, false, 'un intervenant qui n\'a pas enseigné : pas de conflit');
    assert.strictEqual(parId.get('u-form').intervenant, true);
    assert.strictEqual(parId.get('u-sec').intervenant, false, 'un membre de l\'équipe n\'est pas un intervenant');
});

test('juryPropre garde l\'user_id dans sa liste blanche (lu au source)', () => {
    const ctrl = lireApi('controllers/examen.controller.js');
    const corps = ctrl.slice(ctrl.indexOf('function juryPropre'), ctrl.indexOf('function juryPropre') + 1200);
    assert.match(corps, /user_id: texte\(m && m\.user_id, 64\) \|\| null/, 'l\'user_id est conservé à l\'écriture');
});

test('ROLES_JURY est tenu d\'accord avec l\'équipe (TEAM_ROLES)', () => {
    const lire = (src, nom) => {
        const m = new RegExp(`const ${nom} = \\[([^\\]]+)\\]`).exec(src);
        return m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean).sort() : null;
    };
    const rj = lire(lireApi('controllers/examen.controller.js'), 'ROLES_JURY');
    const tr = lire(lireApi('controllers/equipe.controller.js'), 'TEAM_ROLES');
    assert.ok(rj && tr, 'les deux listes se lisent');
    assert.deepStrictEqual(rj, tr, 'le jury se choisit dans l\'équipe + intervenants : mêmes rôles');
});

test('CommissionJury : on choisit la personne dans le registre, avec le contrôle « a formé »', () => {
    const ui = lireUi('components/CommissionJury.jsx');
    assert.match(ui, /user_id: null, nom: "", prenom: ""/, 'un membre vierge porte un user_id');
    assert.match(ui, /const personnes = data\?\.personnes \|\| \[\];/, 'la liste vient du serveur');
    assert.match(ui, /const choisirMembre = \(i, userId\) =>/);
    assert.match(ui, /na_pas_forme: !p\.a_forme/, 'choisir décoche « n\'a pas formé » si la personne a formé la session');
    assert.match(ui, /onChange=\{\(e\) => choisirMembre\(i, e\.target\.value\)\}/, 'un select remplace la saisie du nom');
    assert.match(ui, /a formé des candidats de cette session/, 'le conflit est affiché');
});
