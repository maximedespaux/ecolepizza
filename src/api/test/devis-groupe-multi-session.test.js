/**
 * UN DEVIS DE GROUPE QUI RÉUNIT PLUSIEURS FORMATIONS EN UN SEUL DOCUMENT (2026-10-03).
 *
 * LE DÉFAUT. Les documents de groupe (company_level) sont rattachés à UNE session : la fiche
 * entreprise appelait `createCompanyDocument` une fois PAR formation cochée, et il naissait donc un
 * devis par formation (NIV1 + NIV2 → deux devis), chacun ne montrant que la sienne. L'école veut UN
 * seul devis couvrant les deux (décidé par AskUserQuestion : fusionner l'étape « Devis »).
 *
 * LA CORRECTION. `createCompanyDocument` accepte une LISTE de sessions, réunit leurs inscriptions
 * (un document par OPCO) et les lie toutes par `document_formation` — c'est ce lien, et non plus la
 * `session_id`, qui fait qu'un même devis COUVRE et COCHE l'étape « Devis » de chaque formation
 * (getCompanyParcours détecte par inscription liée). L'écran envoie les sessions en UN appel.
 *
 * Réintroduire le défaut (une session par appel, détection par session_id) fait rougir ces tests.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* ─── Intégration : UN document lie les inscriptions des DEUX sessions (base simulée) ─── */
const STEPS = [{ slug: 'devis-pro', label: 'Devis professionnel', doc_type: 'DEVIS', signers: '["ORG","ENTREPRISE"]', active: 1, company_level: 1 }];
let gdInserts = [];  // INSERT generated_document
let dfInserts = [];  // INSERT document_formation (les liens)
async function repondre(sql, params) {
    if (/INSERT INTO generated_document/.test(sql)) {
        // VALUES (?, ?, NULL, ?, ?, ?, 'A_FAIRE', 'COMPANY', ?, ?, ?) → id, org, type, slug, title, company, session, opco
        gdInserts.push({ id: params[0], session_id: params[6], opco: params[7] });
        return [{ affectedRows: 1 }];
    }
    if (/INSERT INTO document_formation/.test(sql)) { dfInserts.push({ doc: params[0], enr: params[1] }); return [{ affectedRows: 1 }]; }
    if (/FROM company WHERE id = \?/.test(sql)) return [[{ id: 'c1', opco: null }]];
    if (/SELECT id FROM training_session WHERE id IN \(\?\)/.test(sql)) return [[{ id: 's1' }, { id: 's2' }]];
    if (/SELECT opco FROM generated_document LIMIT 1/.test(sql)) return [[{ opco: null }]];
    if (/FROM document_template/.test(sql)) return [STEPS];
    if (/FROM enrollment e JOIN learner l ON l\.id = e\.learner_id/.test(sql)) {
        // Deux stagiaires, deux sessions, même OPCO (aucun) → UN seul groupe.
        return [[{ id: 'e1', session_id: 's1', opco: null }, { id: 'e2', session_id: 's2', opco: null }]];
    }
    return [[]]; // DELETE, SELECT signés… : rien
}
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = {
    id: cheminDb, filename: cheminDb, loaded: true,
    exports: { promise: () => ({ query: repondre }), query: (s, p, cb) => { if (typeof cb === 'function') cb(null, {}); } },
};
const { createCompanyDocument } = require('../controllers/company.controller.js');

async function appeler(body) {
    gdInserts = []; dfInserts = [];
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const err = console.error; console.error = () => {};
    try { await createCompanyDocument({ params: { id: 'c1' }, body, user: { organization_id: 'o1', id: 'u1' } }, res); }
    finally { console.error = err; }
    return { code, corps };
}

test('DEUX sessions, UN seul document, qui lie les inscriptions des deux', async () => {
    const { code, corps } = await appeler({ session_ids: ['s1', 's2'], template_slug: 'devis-pro' });
    assert.strictEqual(code, 201, JSON.stringify(corps));
    assert.strictEqual(gdInserts.length, 1, 'un seul devis, pas un par session');
    assert.deepStrictEqual(dfInserts.map((d) => d.enr).sort(), ['e1', 'e2'], 'les deux inscriptions sont liées au même document');
    assert.ok(dfInserts.every((d) => d.doc === gdInserts[0].id), 'liées au document créé');
    assert.ok(['s1', 's2'].includes(gdInserts[0].session_id), 'ancré sur une des deux sessions');
});

test('`session_id` seul reste accepté (import d\'un exemplaire signé, anciens appels)', async () => {
    const { code } = await appeler({ session_id: 's1', template_slug: 'devis-pro' });
    assert.strictEqual(code, 201);
    assert.strictEqual(gdInserts.length, 1);
});

test('ni session ni modèle → 422', async () => {
    assert.strictEqual((await appeler({ template_slug: 'devis-pro' })).code, 422);
    assert.strictEqual((await appeler({ session_ids: ['s1'] })).code, 422);
});

/* ─── L'écran rattache un document fusionné à CHAQUE formation qu'il couvre ─── */
test('documentsDeLEtape / horsParcours suivent les sessions COUVERTES (session_ids)', async () => {
    const { documentsDeLEtape, documentsEntrepriseHorsParcours } = await import('../../app/ui/lib/documentsDossier.js');
    const devisFusionne = { id: 'd1', template_slug: 'devis-pro', session_id: 's1', session_ids: ['s1', 's2'] };
    const vieuxParSession = { id: 'd0', template_slug: 'convention', session_id: 's1', session_ids: ['s1'] };
    const docs = [devisFusionne, vieuxParSession];
    // Le devis fusionné apparaît sous l'étape « devis-pro » des DEUX sessions.
    assert.deepStrictEqual(documentsDeLEtape(docs, 'devis-pro', 's1').map((d) => d.id), ['d1']);
    assert.deepStrictEqual(documentsDeLEtape(docs, 'devis-pro', 's2').map((d) => d.id), ['d1'], 'couvre aussi s2');
    // Un document à session unique ne fuit pas sur une autre session.
    assert.deepStrictEqual(documentsDeLEtape(docs, 'convention', 's2').map((d) => d.id), []);
    // Hors parcours : le devis EST une étape de s1 → pas « hors parcours » pour s1.
    const horsP = documentsEntrepriseHorsParcours(docs, new Set(['devis-pro', 'convention']), 's1', new Set(['s1', 's2']));
    assert.ok(!horsP.some((d) => d.id === 'd1'));
});

/* ─── Le câblage, lu au source ─── */
const CO = fs.readFileSync(path.join(__dirname, '..', 'controllers/company.controller.js'), 'utf8');
test('createCompanyDocument accepte session_ids, et la détection du parcours passe par les liens', () => {
    assert.match(CO, /Array\.isArray\(req\.body\.session_ids\)/, 'une liste de sessions est acceptée');
    assert.match(CO, /WHERE e\.session_id IN \(\?\) AND e\.company_id = \? AND e\.organization_id = \?/, 'inscriptions de toutes les sessions');
    // L'étape de groupe est détectée par inscription liée (document_formation), plus par session_id.
    assert.match(CO, /JOIN document_formation df ON df\.document_id = gd\.id\s*\n\s*WHERE gd\.organization_id = \? AND gd\.company_id = \? AND gd\.template_slug = \? AND gd\.scope = 'COMPANY'\s*\n\s*AND df\.enrollment_id IN \(\?\)/);
    // La liste expose les sessions couvertes par chaque document.
    assert.match(CO, /GROUP_CONCAT\(DISTINCT e2\.session_id\)/);
    assert.match(CO, /r\.session_ids = r\.session_ids_csv/);
});

test('l\'écran envoie les sessions en UN SEUL appel', () => {
    const page = fs.readFileSync(path.join(__dirname, '../../app/ui/pages/EntrepriseDetail.jsx'), 'utf8');
    assert.match(page, /createCompanyDocument\(id, \{ session_ids: sessions, template_slug: prep\.slug \}\)/);
});
