/**
 * « MES INFOS » DU STAGIAIRE — ses coordonnées, et SON entreprise (2026-10-05).
 *
 * L'ENTREPRISE EST DU RESSORT DE L'ÉCOLE : le stagiaire ne la CHOISIT pas, ne la CRÉE pas, ne se
 * rattache pas lui-même — sinon il affirmerait un lien faux, et « un nom suffit à créer » semait des
 * doublons. Ce fichier gèle les défauts qui feraient mal :
 *   · un stagiaire ne peut PAS se rattacher à une entreprise lui-même (company_id reçu est ignoré) ;
 *   · on ne CRÉE jamais d'entreprise depuis « Mes infos » ;
 *   · un rattaché NON référent ne peut pas réécrire les coordonnées de l'entreprise (donnée partagée) ;
 *   · le RÉFÉRENT (migration 174), lui, les corrige — l'école l'a désigné, la confiance est établie ;
 *   · le stagiaire corrige enfin SA propre adresse (adresse / CP / ville), pas seulement son nom.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : on enregistre toutes les écritures ─────────────────────────────────────────────
let base;
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            base.queries.push({ q, params });
            if (/information_schema/i.test(q)) return [[{ 1: 1 }]]; // colonneExiste → oui
            if (/^SELECT \* FROM learner WHERE user_id = \?/.test(q)) return [base.learner ? [base.learner] : []];
            if (/^SELECT email FROM user WHERE id = \?/.test(q)) return [[{ email: 'stag@exemple.fr' }]];
            if (/^SELECT name, address, zip_code, town FROM company WHERE id = \?/.test(q)) return [base.company ? [base.company] : []];
            if (/^SELECT representative_learner_id AS r FROM company WHERE id = \?/.test(q)) return [base.company ? [{ r: base.company.representative_learner_id || null }] : []];
            if (/^SELECT profile_visibility FROM learner WHERE id = \?/.test(q)) return [[{ profile_visibility: null }]];
            if (/^(INSERT|UPDATE|DELETE)/i.test(q)) { base.writes.push({ q, params }); return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, []); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const ctrl = require('../controllers/espace.controller.js');

function nouvelleBase(o = {}) { return { queries: [], writes: [], learner: null, company: null, ...o }; }
async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const err = console.error; console.error = () => {};
    try { await fn({ user: { id: 'u1', organization_id: 'o1', role: 'STAGIAIRE' }, params: {}, query: {}, body: {}, ...req }, res); }
    finally { console.error = err; }
    return { code, corps };
}

const STAG = { id: 'l1', organization_id: 'o1', company_id: null, civility: 'M.', first_name: 'Marco', last_name: 'ROSSI' };

// ── Le stagiaire ne se rattache pas, ne crée pas ──────────────────────────────────────────────────
test('le stagiaire ne peut PAS se rattacher à une entreprise lui-même (l\'école seule décide)', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: null } });
    const { code } = await appeler(ctrl.updateMyInfos, { body: { company_id: 'c9' } });
    assert.equal(code, 200);
    assert.ok(!base.writes.some((w) => /UPDATE learner SET company_id/.test(w.q)), 'aucun rattachement : company_id reçu est ignoré');
});

test('on ne crée JAMAIS d\'entreprise depuis « Mes infos » (même avec un nom)', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: null } });
    await appeler(ctrl.updateMyInfos, { body: { company_name: 'NOUVELLE PIZZERIA', company_town: 'paris' } });
    assert.ok(!base.writes.some((w) => /INSERT INTO company/i.test(w.q)), 'pas de création');
    assert.ok(!base.writes.some((w) => /^UPDATE company SET/.test(w.q)), 'et rien à écrire : il n\'a pas d\'entreprise');
});

// ── Modification des coordonnées : réservée au référent ─────────────────────────────────────────────
test('un rattaché NON référent ne peut PAS réécrire les coordonnées de l\'entreprise', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: 'c9' }, company: { id: 'c9', representative_learner_id: 'un-autre' } });
    await appeler(ctrl.updateMyInfos, { body: { company_name: 'RENOMMÉE', company_town: 'paris' } });
    assert.ok(!base.writes.some((w) => /^UPDATE company SET/.test(w.q)), 'la donnée partagée reste intacte');
});

test('le RÉFÉRENT, lui, corrige les coordonnées de son entreprise (ville en capitales)', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: 'c9' }, company: { id: 'c9', representative_learner_id: 'l1' } });
    await appeler(ctrl.updateMyInfos, { body: { company_name: 'PIZZA ROSSI', company_town: 'tarbes' } });
    const maj = base.writes.find((w) => /^UPDATE company SET/.test(w.q));
    assert.ok(maj, 'l\'entreprise est mise à jour');
    assert.ok(maj.params.includes('TARBES'), 'la ville de l\'entreprise part en capitales');
});

// ── L'adresse PERSONNELLE du stagiaire ──────────────────────────────────────────────────────────────
test('le stagiaire corrige SA propre adresse (adresse / CP / ville), sa ville en capitales', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: null } });
    await appeler(ctrl.updateMyInfos, { body: { address: '3 rue du Four', zip_code: '65300', town: 'lannemezan' } });
    const maj = base.writes.find((w) => /^UPDATE learner SET/.test(w.q) && /address/.test(w.q));
    assert.ok(maj, 'l\'adresse perso est écrite sur la fiche');
    assert.ok(maj.params.includes('LANNEMEZAN'), 'sa ville part en capitales');
});

// ── getMyInfos donne à l'écran de quoi décider (lecture / édition référent) ────────────────────────────
test('getMyInfos dit qu\'on est stagiaire, l\'entreprise liée, et si on en est le référent', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: 'c9' }, company: { id: 'c9', name: 'PIZZA BELLA', address: '', zip_code: '65300', town: 'LANNEMEZAN', representative_learner_id: 'l1' } });
    const { corps } = await appeler(ctrl.getMyInfos, {});
    assert.equal(corps.data.is_learner, true);
    assert.equal(corps.data.company_id, 'c9');
    assert.equal(corps.data.company_is_owner, true);
});

// ── Contrats de source : le code dit ce qu'il fait, et le dira encore après un refactor ─────────────────
test('le serveur ne crée pas, ne rattache pas, et garde le verrou du référent', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/espace.controller.js'), 'utf8');
    const fn = src.slice(src.indexOf('const updateMyInfos'), src.indexOf('module.exports'));
    assert.doesNotMatch(fn, /INSERT INTO company/, 'plus de création d\'entreprise');
    assert.doesNotMatch(fn, /UPDATE learner SET company_id/, 'plus de rattachement par le stagiaire');
    assert.match(fn, /estReferentDe\(conn, learner\.company_id, learner\.id\)/, 'l\'édition reste réservée au référent');
    assert.doesNotMatch(src, /const searchMyCompanies/, 'l\'endpoint de recherche a été retiré');
});

test('l\'écran n\'envoie les champs entreprise QUE si le stagiaire en est le référent, et ne cherche plus', () => {
    const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/components/ProfileModal.jsx'), 'utf8');
    assert.match(ui, /if \(f\.company_is_owner\) \{\s*payload\.company_name/, 'coordonnées entreprise conditionnées au référent');
    assert.doesNotMatch(ui, /searchMyCompanies/, 'plus de recherche d\'entreprise côté écran');
    assert.doesNotMatch(ui, /Rechercher mon entreprise/, 'plus de champ de recherche');
});
