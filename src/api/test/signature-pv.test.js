/**
 * SIGNATURE À DISTANCE DU PROCÈS-VERBAL (migration 216 / tranche 2).
 *
 * Le PV n'est pas un document du dossier : ses signatures vivent dans `exam_signature`, une par
 * signataire (membre de la commission AVEC compte, ou candidat). Chacun signe par SON lien public,
 * sans compte. Ces tests gèlent : l'état des signatures rendu au personnel (getSignatures), les
 * gardes du contrôleur public (jeton, clôture, image valide, pas de double-signature), le câblage
 * des routes et de l'écran, et la forme de la migration.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');
const lireMig = (f) => fs.readFileSync(path.join(API, '..', '..', 'database', 'migrations', f), 'utf8');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-pour-les-liens-pv';

/* --- Mock DB pour getSignatures (lecture seule). --- */
let tableAbsente = false;   // simule « migration 216 non jouée »
let statut = 'CLOTUREE';    // statut de la commission
const faux = {
    promise: () => ({
        query: async (sql) => {
            if (/information_schema\.tables/i.test(sql)) return [tableAbsente ? [] : [{ 1: 1 }]];
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]]; // colonnes (supportePv) → vrai
            if (/FROM exam_session/i.test(sql)) return [[{
                id: 'ex-1', training_session_id: 's-1', organization_id: 'o1', status: statut, pv_ref: 'PV-1',
                jury: JSON.stringify([{ user_id: 'u-1', nom: 'Dubois', prenom: 'Paul' }, { nom: 'Ferrand', prenom: 'Hélène' }]),
            }]];
            if (/FROM exam_result/i.test(sql)) return [[]];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [[{ learner_id: 'l-1', first_name: 'Zoé', last_name: 'Martin' }]];
            if (/FROM exam_signature/i.test(sql)) return [[{ signer_kind: 'MEMBRE', signer_ref: 'u-1', signer_name: 'Dubois Paul', signed_at: '2026-12-18 10:00:00' }]];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { getSignatures } = require('../controllers/examen.controller.js');

function faireRes() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    return res;
}

test('getSignatures : membres AVEC compte + candidats, liens après clôture, signés signalés', async () => {
    tableAbsente = false; statut = 'CLOTUREE';
    const res = faireRes();
    await getSignatures({ user: { organization_id: 'o1' }, params: { id: 's-1' } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    const d = res.corps.data;
    assert.strictEqual(d.cloture, true);
    assert.strictEqual(d.membres.length, 1, 'seul le membre AVEC compte signe à distance');
    assert.strictEqual(d.membres[0].ref, 'u-1');
    assert.strictEqual(d.membres[0].signe, true, 'sa signature est déjà posée');
    assert.match(d.membres[0].url, /\/pv-signer\//, 'lien donné après clôture');
    assert.strictEqual(d.membres_sans_compte, 1, 'le membre saisi à la main est compté à part');
    assert.strictEqual(d.candidats.length, 1);
    assert.strictEqual(d.candidats[0].signe, false);
    assert.ok(d.candidats[0].url, 'le candidat a aussi un lien');
});

test('getSignatures : avant clôture, aucun lien (le PV n\'est pas figé)', async () => {
    statut = 'OUVERTE';
    const res = faireRes();
    await getSignatures({ user: { organization_id: 'o1' }, params: { id: 's-1' } }, res);
    assert.strictEqual(res.corps.data.cloture, false);
    assert.strictEqual(res.corps.data.membres[0].url, null, 'pas de lien tant que ce n\'est pas clôturé');
    statut = 'CLOTUREE';
});

test('getSignatures : sans la table (216 non jouée) → 503', async () => {
    tableAbsente = true;
    const res = faireRes();
    await getSignatures({ user: { organization_id: 'o1' }, params: { id: 's-1' } }, res);
    assert.strictEqual(res.code, 503);
    tableAbsente = false;
});

test('public : la signature du PV est gardée (jeton, clôture, image, double-signature)', () => {
    const ctrl = lireApi('controllers/public.controller.js');
    assert.match(ctrl, /const v = verifierLienPv\(req\.params\.token\);/);
    assert.match(ctrl, /if \(!v\) return res\.status\(404\)/);
    assert.match(ctrl, /ex\.status !== 'CLOTUREE'/, 'on ne signe qu\'un PV clôturé');
    assert.match(ctrl, /nomDuSignataire\(conn, v\.orgId, ex\.training_session_id, commission, v\.signerKind, v\.signerRef\)/, 'signataire légitime');
    assert.match(ctrl, /if \(!signature_data \|\| !estSignatureValide\(signature_data\)\)/, 'image strictement validée');
    assert.match(ctrl, /if \(await dejaSignePv\(conn, c\.ex\.id, v\.signerKind, v\.signerRef\)\)/, 'pas de double-signature');
    assert.match(ctrl, /e\.code === 'ER_DUP_ENTRY'[\s\S]*déjà signé/, 'course entre onglets tranchée par la clé unique');
    assert.match(ctrl, /await recordSignaturePv\(conn, \{/);
    assert.match(ctrl, /tableExiste\(conn, 'exam_signature'\)/, 'la table 216 est exigée');
});

test('routes : endpoints publics /pv-sign et état des signatures montés', () => {
    const pub = lireApi('routes/public.routes.js');
    assert.match(pub, /router\.get\('\/pv-sign\/:token', getPvSignPage\)/);
    assert.match(pub, /router\.post\('\/pv-sign\/:token', submitPvSign\)/);
    const ex = lireApi('routes/examen.routes.js');
    assert.match(ex, /router\.get\('\/session\/:id\/signatures', authorizeRoles\(\.\.\.STAFF_ROLES\), getSignatures\)/);
});

test('front : page publique de signature + section « Signatures » sur la commission', () => {
    const page = lireUi('pages/SignerPvPublic.jsx');
    assert.match(page, /getPublicPvSign/);
    assert.match(page, /submitPublicPvSign/);
    const main = lireUi('main.jsx');
    assert.match(main, /path="\/pv-signer\/:token" element=\{<SignerPvPublic \/>\}/);
    const jury = lireUi('components/CommissionJury.jsx');
    assert.match(jury, /getPvSignatures/);
    assert.match(jury, /Signatures du procès-verbal/);
    assert.match(jury, /copierLien\(s\.url, ref\)/);
    const api = lireUi('api/apiClient.js');
    assert.match(api, /export function getPublicPvSign\(token\)/);
    assert.match(api, /export function submitPublicPvSign\(token, payload\)/);
    assert.match(api, /export function getPvSignatures\(sessionId\)/);
});

test('migration 216 : table exam_signature (unicité + cascade) et son revert', () => {
    const up = lireMig('216_exam_signature.sql');
    assert.match(up, /CREATE TABLE IF NOT EXISTS exam_signature/);
    assert.match(up, /UNIQUE KEY uq_exam_signer \(exam_session_id, signer_kind, signer_ref\)/);
    assert.match(up, /FOREIGN KEY \(exam_session_id\)[\s\S]*REFERENCES exam_session \(id\) ON DELETE CASCADE/);
    const rev = lireMig('216_revert_exam_signature.sql');
    assert.match(rev, /DROP TABLE IF EXISTS exam_signature/);
});
