/**
 * LES SIGNATURES RECUEILLIES SE POSENT DANS LE PV (migration 216 / tranche 3).
 *
 * Les tranches 1 (composition depuis le registre) et 2 (signature à distance) remplissent
 * `exam_signature`. Ici, le RENDU : le PV va chercher ces images et les pose dans ses cases —
 * la signature d'un membre dans sa colonne ({PVSignatures}) et dans l'annexe d'émargement
 * ({PVMembres}), celle d'un candidat dans sa ligne ({PVCandidats}). Une case sans signature reste
 * vide (à signer à la main) — le comportement d'avant la 216.
 *
 * Ces tests gèlent : le chargement DÉCHIFFRÉ des signatures (contexteExamen), et leur pose dans les
 * bons jetons (resolveTokens) — par la clé « MEMBRE:<user_id> » / « CANDIDAT:<learner_id> ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');

const { contexteExamen } = require('../controllers/examen.controller.js');
const { resolveTokens } = require('../lib/tokens.js');
const { encrypt } = require('../lib/crypto.js');

// Un VRAI PNG 1×1 (transparent) : signatureBox le décode pour le cadrer, un faux data-URL casserait.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const nbImg = (html) => (String(html).match(/<img/g) || []).length;

test('resolveTokens : la signature d\'un membre / d\'un candidat se pose dans sa case', () => {
    const ctx = {
        exam: { jury: [
            { user_id: 'u-1', nom: 'Dubois', prenom: 'Paul', qualite: 'présidente' },
            { user_id: 'u-2', nom: 'Ferrand', prenom: 'Hélène', qualite: 'membre' }, // pas signé
        ] },
        pvCandidats: [
            { learner_id: 'l-1', first_name: 'Zoé', last_name: 'Martin', decision: 'CERTIFIE' },
            { learner_id: 'l-2', first_name: 'Léo', last_name: 'Blanc', decision: 'EN_COURS' }, // pas signé
        ],
        pvSignatures: { 'MEMBRE:u-1': PNG, 'CANDIDAT:l-1': PNG },
    };
    const v = resolveTokens(ctx);
    // Un seul membre a signé : une image dans la case des signatures ET dans l'émargement des membres.
    assert.strictEqual(nbImg(v.PVSignatures), 1, 'seul le membre signataire a une image');
    assert.strictEqual(nbImg(v.PVMembres), 1, 'idem dans l\'annexe d\'émargement des membres');
    // Un seul candidat a signé : une image dans son émargement (annexe candidats).
    assert.strictEqual(nbImg(v.PVCandidats), 1, 'seul le candidat signataire a une image');
    assert.match(v.PVSignatures, /<img src="data:image\//, 'c\'est bien une image de signature');
});

test('resolveTokens : sans signature recueillie, le PV garde ses cases vides (aucune image)', () => {
    const ctx = {
        exam: { jury: [{ user_id: 'u-1', nom: 'Dubois', prenom: 'Paul' }] },
        pvCandidats: [{ learner_id: 'l-1', first_name: 'Zoé', last_name: 'Martin', decision: 'CERTIFIE' }],
        pvSignatures: {},
    };
    const v = resolveTokens(ctx);
    assert.strictEqual(nbImg(v.PVSignatures), 0, 'cases vides, à signer à la main');
    assert.strictEqual(nbImg(v.PVMembres), 0);
    assert.strictEqual(nbImg(v.PVCandidats), 0);
});

test('contexteExamen charge et DÉCHIFFRE les signatures du PV', async () => {
    const examSig = [
        { signer_kind: 'MEMBRE', signer_ref: 'u-1', signature: encrypt(PNG) },
        { signer_kind: 'CANDIDAT', signer_ref: 'l-1', signature: encrypt(PNG) },
    ];
    const conn = {
        query: async (sql) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]]; // supportePv
            if (/FROM exam_session/i.test(sql)) return [[{ id: 'ex-1', training_session_id: 's-1', organization_id: 'o1', status: 'CLOTUREE', jury: JSON.stringify([{ user_id: 'u-1', nom: 'Dubois', prenom: 'Paul' }]) }]];
            if (/FROM exam_result/i.test(sql)) return [[]];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [[{ learner_id: 'l-1', first_name: 'Zoé', last_name: 'Martin', civility: 'Mme', birthday: '01/01/1990' }]];
            if (/FROM exam_signature/i.test(sql)) return [examSig];
            return [[]];
        },
    };
    const ctx = await contexteExamen(conn, 'o1', 's-1');
    assert.strictEqual(ctx.pvSignatures['MEMBRE:u-1'], PNG, 'la signature du membre est déchiffrée');
    assert.strictEqual(ctx.pvSignatures['CANDIDAT:l-1'], PNG, 'celle du candidat aussi');
});

test('contexteExamen : sans la table (216 non jouée), aucune signature — rien ne casse', async () => {
    const conn = {
        query: async (sql) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            if (/FROM exam_session/i.test(sql)) return [[{ id: 'ex-1', training_session_id: 's-1', organization_id: 'o1', status: 'CLOTUREE', jury: '[]' }]];
            if (/FROM exam_result/i.test(sql)) return [[]];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [[]];
            if (/FROM exam_signature/i.test(sql)) { const e = new Error('no table'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }
            return [[]];
        },
    };
    const ctx = await contexteExamen(conn, 'o1', 's-1');
    assert.deepStrictEqual(ctx.pvSignatures, {}, 'migration 216 non jouée : map vide, pas d\'erreur');
});

test('câblage : les signatures traversent contexteExamen, loadContext et les tables du PV', () => {
    const examen = lireApi('controllers/examen.controller.js');
    // contexteExamen lit exam_signature, déchiffre, et rend pvSignatures.
    assert.match(examen, /FROM exam_signature WHERE exam_session_id = \?/);
    assert.match(examen, /pvSignatures\[`\$\{s\.signer_kind\}:\$\{s\.signer_ref\}`\] = clair/);
    assert.match(examen, /\n\s*pvSignatures,\n/, 'contexteExamen rend pvSignatures');
    // loadContext (document.controller) le fait suivre jusqu'au ctx d'un PV de dossier.
    const doc = lireApi('controllers/document.controller.js');
    assert.match(doc, /\(\{ exam, pvCandidats, examResult, pvSignatures \} = px\)/);
    assert.match(doc, /pvCandidats, pvSignatures, examResult/);
    // tokens.js : les tables posent les signatures, par leur clé.
    const tok = lireApi('lib/tokens.js');
    assert.match(tok, /function pvSignaturesTable\(jury, sigs = \{\}\)/);
    assert.match(tok, /function pvMembresTable\(jury, sigs = \{\}\)/);
    assert.match(tok, /function pvCandidatsTable\(lignes, sigs = \{\}\)/);
    assert.match(tok, /sigs\[`MEMBRE:\$\{m\.user_id\}`\]/);
    assert.match(tok, /sigs\[`CANDIDAT:\$\{c\.learner_id\}`\]/);
    assert.match(tok, /PVSignatures: pvSignaturesTable\(jury, pvSig\)/);
});
