/**
 * « MES INFOS » DU STAGIAIRE — ses coordonnées, et SON entreprise (2026-10-05).
 *
 * Ce fichier gèle les défauts qui feraient mal :
 *   · un stagiaire RATTACHÉ à une entreprise mais qui n'en est PAS le référent ne doit pas pouvoir
 *     en RÉÉCRIRE les coordonnées : deux employés de la même pizzeria se marcheraient dessus, et
 *     l'un effacerait l'adresse que l'autre vient de corriger. Seul le RÉFÉRENT (migration 174) édite ;
 *   · on ne CRÉE plus d'entreprise « parce qu'un nom a été tapé » — ça semait des doublons. Sans
 *     entreprise, le stagiaire en CHOISIT une existante par une recherche, et rien n'est créé ;
 *   · la recherche ne répond RIEN sous trois caractères (anti-spam) et n'expose jamais la liste
 *     entière ; les caractères spéciaux d'un LIKE (%, _, \) sont échappés ;
 *   · le stagiaire peut enfin corriger SA propre adresse (adresse / CP / ville), pas seulement son nom.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : on enregistre toutes les requêtes et les écritures ─────────────────────────────
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
            if (/^SELECT id FROM company WHERE id = \? AND organization_id = \?/.test(q)) {
                const c = (base.companies || []).find((x) => x.id === params[0] && x.organization_id === params[1]);
                return [c ? [{ id: c.id }] : []];
            }
            if (/^SELECT id, name, zip_code, town FROM company WHERE organization_id = \? AND name LIKE \?/.test(q)) {
                base.likeParams = params; return [base.searchRows || []];
            }
            if (/^(INSERT|UPDATE|DELETE)/i.test(q)) { base.writes.push({ q, params }); return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, []); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const ctrl = require('../controllers/espace.controller.js');

function nouvelleBase(o = {}) {
    return { queries: [], writes: [], learner: null, company: null, companies: [], searchRows: [], ...o };
}
async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const err = console.error; console.error = () => {};
    try { await fn({ user: { id: 'u1', organization_id: 'o1', role: 'STAGIAIRE' }, params: {}, query: {}, body: {}, ...req }, res); }
    finally { console.error = err; }
    return { code, corps };
}

const STAG = { id: 'l1', organization_id: 'o1', company_id: null, civility: 'M.', first_name: 'Marco', last_name: 'ROSSI' };

// ── La recherche d'entreprise ─────────────────────────────────────────────────────────────────────
test('la recherche ne répond RIEN sous 3 caractères, et n\'interroge même pas la base', async () => {
    base = nouvelleBase({ learner: { ...STAG } });
    const { corps } = await appeler(ctrl.searchMyCompanies, { query: { q: 'ab' } });
    assert.deepEqual(corps, { data: [] });
    assert.ok(!base.queries.some((x) => /company WHERE organization_id/.test(x.q)), 'aucune requête entreprise');
});

test('à 3 caractères, la recherche est bornée à l\'organisme et échappe les jokers du LIKE', async () => {
    base = nouvelleBase({ learner: { ...STAG }, searchRows: [{ id: 'c9', name: 'PIZZA BELLA', zip_code: '65300', town: 'LANNEMEZAN' }] });
    const { corps } = await appeler(ctrl.searchMyCompanies, { query: { q: 'bel' } });
    assert.deepEqual(corps.data, [{ id: 'c9', name: 'PIZZA BELLA', zip_code: '65300', town: 'LANNEMEZAN' }]);
    assert.equal(base.likeParams[0], 'o1', 'bornée à l\'organisme du stagiaire');
    assert.equal(base.likeParams[1], '%bel%');
    // Les jokers d'un nom (%, _, \) sont échappés : « a%b_c » est cherché à la lettre, pas comme un motif.
    base = nouvelleBase({ learner: { ...STAG }, searchRows: [] });
    await appeler(ctrl.searchMyCompanies, { query: { q: 'a%b_c' } });
    assert.equal(base.likeParams[1], '%a\\%b\\_c%');
});

// ── Rattachement : on CHOISIT, on ne crée plus ─────────────────────────────────────────────────────
test('sans entreprise, le stagiaire en CHOISIT une existante (et rien n\'est jamais créé)', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: null }, companies: [{ id: 'c9', organization_id: 'o1' }] });
    const { code } = await appeler(ctrl.updateMyInfos, { body: { company_id: 'c9' } });
    assert.equal(code, 200);
    assert.ok(base.writes.some((w) => /^UPDATE learner SET company_id = \?/.test(w.q) && w.params[0] === 'c9'), 'rattaché');
    assert.ok(!base.writes.some((w) => /INSERT INTO company/i.test(w.q)), 'jamais de création d\'entreprise');
});

test('choisir une entreprise d\'un AUTRE organisme est refusé (422), sans rien rattacher', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: null }, companies: [{ id: 'c9', organization_id: 'AUTRE' }] });
    const { code } = await appeler(ctrl.updateMyInfos, { body: { company_id: 'c9' } });
    assert.equal(code, 422);
    assert.ok(!base.writes.some((w) => /company_id/.test(w.q)), 'aucun rattachement écrit');
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

// ── getMyInfos donne à l'écran de quoi décider ───────────────────────────────────────────────────────
test('getMyInfos dit qu\'on est stagiaire, l\'entreprise liée, et si on en est le référent', async () => {
    base = nouvelleBase({ learner: { ...STAG, company_id: 'c9' }, company: { id: 'c9', name: 'PIZZA BELLA', address: '', zip_code: '65300', town: 'LANNEMEZAN', representative_learner_id: 'l1' } });
    const { corps } = await appeler(ctrl.getMyInfos, {});
    assert.equal(corps.data.is_learner, true);
    assert.equal(corps.data.company_id, 'c9');
    assert.equal(corps.data.company_is_owner, true);
});

// ── Contrats de source (le code dit ce qu'il fait, et le dira encore après un refactor) ───────────────
test('le serveur ne crée plus d\'entreprise depuis « Mes infos », et garde le verrou du référent', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/espace.controller.js'), 'utf8');
    const fn = src.slice(src.indexOf('const updateMyInfos'), src.indexOf('module.exports'));
    assert.doesNotMatch(fn, /INSERT INTO company/, 'plus de création d\'entreprise par le stagiaire');
    assert.match(fn, /estReferentDe\(conn, learner\.company_id, learner\.id\)/, 'l\'édition est réservée au référent');
});

test('l\'écran n\'envoie les champs entreprise QUE si le stagiaire en est le référent', () => {
    const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/components/ProfileModal.jsx'), 'utf8');
    assert.match(ui, /if \(f\.company_is_owner\) \{\s*payload\.company_name/, 'les coordonnées entreprise sont conditionnées au référent');
    assert.match(ui, /t\.length < 3/, 'la recherche n\'est lancée qu\'à partir de 3 caractères');
});
