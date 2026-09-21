/**
 * LE JURY SIGNE EN LIGNE LA GRILLE DE CHAQUE CANDIDAT.
 *
 * DEMANDÉ LE 2026-09-21, après les documents de session. La grille d'un candidat porte déjà un
 * tableau {JuryMembres} : une ligne par membre, avec sa case de signature — « le règlement
 * d'examen fait signer chacun ». Ces cases restaient vides : aucun chemin ne les remplissait.
 *
 * L'ORDRE EST TOUT LE SUJET :
 *   1. la CLÔTURE d'une évaluation produit la grille, avec une case vide par membre du jury ;
 *   2. chaque membre la signe depuis son espace, et sa signature s'imprime dans SA ligne ;
 *   3. la grille ne part au CANDIDAT qu'une fois le jury au complet — partie plus tôt, il
 *      signerait un document incomplet, et son PDF scellé ne porterait pas le jury ;
 *   4. le candidat signe, PUIS l'organisme, en dernier.
 * Sans garde, la dernière signature du jury passait la grille à SIGNÉ et faisait contresigner
 * l'organisme — le candidat n'aurait plus jamais pu signer.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : un routeur de requêtes, réglé par test ───────────────────────────────────────
let routes = [];
let journal = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            journal.push({ sql, params });
            const r = routes.find(([motif]) => motif.test(sql));
            return r ? (typeof r[1] === 'function' ? r[1](sql, params) : r[1]) : [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const docCtrl = require('../controllers/document.controller.js');
const { applySlotSignature, sendDocument } = docCtrl;
const { cloturerCandidat, resultatJuryDossier } = require('../controllers/evaluation.controller.js');
const { resolveTokens } = require('../lib/tokens.js');
const { creneauJury } = require('../lib/documents.js');
const conn = faux.promise();

// Une grille de jury complète, avis prononcé, deux membres affectés à la session.
const JURY = [
    [/information_schema/i, [[{ 1: 1 }]]],
    [/FROM enrollment e\s+JOIN training_session/i, [[{ id: 'enr-1', program_id: 'p-1' }]]],
    [/FROM evaluation_grille/i, [[{ id: 'g-1', program_id: 'p-1', role: 'JURY', label: 'Grille jury', pass_score: null, template_slug: 'grille-jury', active: 1 }]]],
    [/FROM evaluation_exercice/i, [[{ id: 'x1', competence_id: 'k1', label: 'C1.1 - Farine', bareme: 'BINAIRE', max_points: 1, active: 1, obligatoire: 0 }]]],
    [/FROM evaluation_competence/i, [[{ id: 'k1', code: 'C1', label: 'Fabriquer une pâte', min_valides: null, active: 1 }]]],
    [/FROM evaluation_note WHERE enrollment_id/i, [[{ exercice_id: 'x1', points: 1, valeur: 'OUI', commentaire: null }]]],
    [/FROM evaluation_verdict/i, [[{ avis: 'FAVORABLE', rattrapage: 0, observations: null, cloture_le: null }]]],
    [/JOIN session_intervenant si/i, [[
        { user_id: 'u-rios', first_name: 'Pascal', last_name: 'RIOS', specialty: 'Jury' },
        { user_id: 'u-lefaou', first_name: 'Dominique', last_name: 'LE FAOU', specialty: 'Président du jury' },
    ]]],
    [/SELECT learner_id FROM enrollment/i, [[{ learner_id: 'l-1' }]]],
];

test('À LA CLÔTURE, LA GRILLE NAÎT AVEC UNE CASE VIDE PAR MEMBRE DU JURY', async () => {
    routes = [...JURY]; journal = [];
    const vrai = docCtrl.prepareLearnerDoc;
    docCtrl.prepareLearnerDoc = async () => 'grille-1';   // pas de vrai document : on regarde les cases
    try {
        const r = await cloturerCandidat(conn, 'o1', 'u-rios', 'enr-1');
        assert.strictEqual(r.documentId, 'grille-1');
    } finally { docCtrl.prepareLearnerDoc = vrai; }
    const cases = journal.filter((q) => /INSERT INTO document_signature/.test(q.sql)).map((q) => q.params.slice(2));
    assert.deepStrictEqual(cases, [
        ['grille-1', creneauJury('u-rios'), 'Jury · RIOS Pascal', 'u-rios'],
        ['grille-1', creneauJury('u-lefaou'), 'Jury · LE FAOU Dominique', 'u-lefaou'],
    ], 'une case ATTRIBUÉE à chaque membre : il la retrouve dans son espace');
    assert.ok(cases.every((c) => !/NOW\(\)/.test(String(c))), 'elles partent vides');
});

test('SA SIGNATURE S\'IMPRIME DANS SA LIGNE — l\'autre ligne reste un espace blanc', async () => {
    routes = [...JURY];
    const jv = await resultatJuryDossier(conn, 'o1', 'enr-1');
    const IMG = 'data:image/png;base64,UklPUw==';
    const html = resolveTokens({ jury: { ...jv, membres: jv.membres.map((m) => ({ ...m, signature: m.user_id === 'u-rios' ? IMG : null })) } }).JuryMembres;
    const [rios, lefaou] = html.split('<tr>').filter((l) => /RIOS|LE FAOU/.test(l));
    assert.ok(rios.includes(`<img src="${IMG}"`), 'la signature de RIOS dans la ligne de RIOS');
    assert.match(lefaou, /<td>&nbsp;<br>&nbsp;<\/td><\/tr>/, 'pas encore signé : la case attend');
    // La clôture et le rendu parlent de la MÊME case : un seul nom de créneau, partagé.
    const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.match(lire('controllers/document.controller.js'), /slotSignatures\[creneauJury\(m\.user_id\)\]/);
    assert.match(lire('controllers/evaluation.controller.js'), /creneauJury\(m\.user_id\), `Jury · \$\{nom\}`\.trim\(\), m\.user_id\]/);
});

test('LA DERNIÈRE SIGNATURE DU JURY NE CLÔT PAS UNE GRILLE QUE LE CANDIDAT DOIT SIGNER', async () => {
    const signer = async (doc) => {
        routes = [[/COUNT\(\*\) AS n FROM document_signature WHERE document_id = \? AND signed_at IS NULL/, [[{ n: 0 }]]]];
        journal = [];
        await applySlotSignature(conn, 'o1', doc, { slot: creneauJury('u-lefaou'), label: 'Jury · LE FAOU Dominique', signerName: 'Dominique LE FAOU', signatureData: 'data:image/png;base64,AA==' });
        return journal.some((q) => /SET status = 'SIGNE'/.test(q.sql));
    };
    // Un document de STAGIAIRE que le stagiaire doit signer (type CONTRAT : ORG + STAGIAIRE).
    const grille = { id: 'grille-1', template_slug: 'sans-rendu', type: 'CONTRAT', learner_id: 'l-1', status: 'A_FAIRE' };
    assert.strictEqual(await signer(grille), false, 'le jury au complet, mais le candidat n\'a pas signé : la grille attend');
    assert.strictEqual(await signer({ ...grille, status: 'SIGNE' }), true, 'si le candidat a déjà signé, la dernière case clôt');
    assert.strictEqual(await signer({ ...grille, learner_id: null }), true, 'un document sans stagiaire (de session) n\'attend personne d\'autre');
});

test('LA GRILLE NE PART AU CANDIDAT QU\'UNE FOIS LE JURY AU COMPLET', async () => {
    routes = [
        [/SELECT id, type, template_slug, status, learner_id FROM generated_document/, [[{ id: 'grille-1', type: 'EVALUATION', template_slug: 'grille-jury', status: 'A_FAIRE', learner_id: 'l-1' }]]],
        [/FROM document_template WHERE organization_id = \? AND slug = \?/, [[{ kind: 'builder', body_html: '<p>Grille</p>', header_html: '', footer_html: '', layout: null }]]],
        [/SELECT label, slot FROM document_signature WHERE document_id = \? AND user_id IS NOT NULL AND signed_at IS NULL/,
            [[{ label: 'Jury · LE FAOU Dominique', slot: creneauJury('u-lefaou') }]]],
    ];
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await sendDocument({ params: { id: 'grille-1' }, body: {}, user: { organization_id: 'o1', id: 'u0', role: 'SUPER_ADMIN' }, headers: {} }, res); }
    finally { console.error = erreurs; }
    assert.strictEqual(code, 422);
    assert.match(corps.message, /Jury · LE FAOU Dominique/, 'le message NOMME qui n\'a pas signé');
    assert.ok(!journal.some((q) => /SET status = 'ENVOYE'/.test(q.sql)), 'rien n\'est parti');
    // L'envoi de groupe saute la grille, sans erreur : elle partira au prochain envoi.
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
    const groupe = src.slice(src.indexOf('async function sendPreparedDoc'), src.indexOf('async function sendPreparedDoc') + 900);
    assert.match(groupe, /if \(\(await signaturesEnAttente\(conn, doc\.id\)\)\.length\) return false;/);
});

test('DANS L\'ESPACE DU JURY : chaque grille nomme son candidat, et apparaît dès la clôture', () => {
    const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.match(lire('controllers/intervenant.controller.js'), /AS candidat,/);
    const ui = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
    const espace = ui('pages/IntervenantEspace.jsx');
    assert.match(espace, /\{d\.candidat \? <span> — \{d\.candidat\}<\/span> : null\}/, 'sinon quatre lignes identiques');
    assert.match(espace, /onCloture=\{\(\) => setDocsVersion\(\(v\) => v \+ 1\)\}/);
    assert.match(espace, /useEffect\(\(\) => \{ charger\(\); \}, \[version\]\);/);
    assert.match(ui('components/JuryGrille.jsx'), /Chaque membre du jury signe la grille dans « Documents à signer » ; elle partira ensuite au candidat\./);
});
