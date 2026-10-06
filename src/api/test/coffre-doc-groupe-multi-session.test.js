/**
 * UN DOCUMENT DE GROUPE MULTI-SESSION APPARAÎT SOUS CHAQUE SESSION DANS LE COFFRE (2026-10-06).
 *
 * Une convention (ou un devis) prise pour PLUSIEURS sessions à la fois — NIV1PRO (semaine 6) ET NIV2
 * (semaine 12) de GERVAIS Raphaelle — est UN SEUL document (même doc_id) qui lie les inscriptions des
 * deux par `document_formation`. Le coffre l'ancrait à `gd.session_id` (la 1re session) : il ne se
 * voyait qu'en semaine 6. On veut le voir sous CHAQUE session couverte, SANS nouvelle génération :
 * `lignesDuCoffre` produit une ligne par session couverte, MÊME doc_id, dédupliquée par emplacement.
 */
const test = require('node:test');
const assert = require('node:assert');

// ── Fausse base : colonnes présentes, réponses par motif (cf. archives-rangement-dossier) ──────────
let colonnes = new Set();
let reponses = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema\.columns/.test(sql)) return [colonnes.has(`${params[0]}.${params[1]}`) ? [{ 1: 1 }] : []];
            const r = reponses.find(([motif]) => motif.test(sql));
            return r ? (typeof r[1] === 'function' ? r[1](sql, params) : r[1]) : [[]];
        },
    }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const suivi = require('../controllers/suivi.controller.js');

// Le document de groupe, tel que la requête `comp` le rend (ancré sur sa 1re session, NIV1PRO/S6).
const DOC_BASE = {
    doc_id: 'g1', title: 'Convention de formation', type: 'CONVENTION', status: 'SIGNE', quiz_id: null, scope: 'COMPANY',
    company_id: 'c1', company_name: 'GERVAIS Raphaelle', sent_at: null, signed_at: '2026-10-06 13:16',
    year: 2026, week: 6, program_code: 'NIV1PRO', program_title: 'Pizzaïolo Niveau I PRO', first_name: '', last_name: 'GERVAIS Raphaelle',
    source: 'gen', dossier: null, slug: 'convention', quiz_title: null, enrollment_id: null,
    enr_company_id: 'c1', enr_company_name: 'GERVAIS Raphaelle', session_id: 's6', debut: '2026-02-02', fin: '2026-02-06',
};
const COMP = [/JOIN company c ON c\.id = gd\.company_id/, [[DOC_BASE]]];

test('le document de groupe se voit sous CHAQUE session couverte, même doc_id', async () => {
    colonnes = new Set(['archive_document.dossier']);
    reponses = [COMP, [/FROM document_formation df/, [[
        { document_id: 'g1', session_id: 's6', year: 2026, week: 6, program_code: 'NIV1PRO', program_title: 'Pizzaïolo Niveau I PRO', debut: '2026-02-02', fin: '2026-02-06' },
        { document_id: 'g1', session_id: 's12', year: 2026, week: 12, program_code: 'NIV2', program_title: 'Pizzaïolo Niveau II', debut: '2026-03-16', fin: '2026-03-20' },
    ]]]];
    const c = await suivi.lignesDuCoffre(faux.promise(), 'o1');
    assert.strictEqual(c.comp.length, 2, 'une ligne par session couverte');
    assert.deepStrictEqual(c.comp.map((d) => d.doc_id), ['g1', 'g1'], 'le MÊME document (aucune nouvelle génération)');
    assert.deepStrictEqual(c.comp.map((d) => [d.week, d.program_code, d.session_id]).sort(),
        [[6, 'NIV1PRO', 's6'], [12, 'NIV2', 's12']].sort());
    // Les champs du document (titre, statut, signature) sont identiques : c'est bien le même.
    for (const d of c.comp) { assert.strictEqual(d.title, 'Convention de formation'); assert.strictEqual(d.signed_at, '2026-10-06 13:16'); }
});

test('UNE SEULE session couverte, ou aucun lien : une seule ligne (comportement d\'avant)', async () => {
    colonnes = new Set(['archive_document.dossier']);
    // Une seule inscription liée (un seul dossier) → une ligne, à cette session.
    reponses = [COMP, [/FROM document_formation df/, [[
        { document_id: 'g1', session_id: 's6', year: 2026, week: 6, program_code: 'NIV1PRO', program_title: 'Pizzaïolo Niveau I PRO', debut: '2026-02-02', fin: '2026-02-06' },
    ]]]];
    const un = await suivi.lignesDuCoffre(faux.promise(), 'o1');
    assert.strictEqual(un.comp.length, 1);
    assert.strictEqual(un.comp[0].week, 6);

    // Aucun lien (document ancien, ou migration absente) : il reste à sa session d'ancrage.
    reponses = [COMP, [/FROM document_formation df/, [[]]]];
    const sansLien = await suivi.lignesDuCoffre(faux.promise(), 'o1');
    assert.strictEqual(sansLien.comp.length, 1);
    assert.strictEqual(sansLien.comp[0].doc_id, 'g1');
});

test('deux sessions au MÊME emplacement (année/semaine/formation) : une seule ligne', async () => {
    colonnes = new Set(['archive_document.dossier']);
    reponses = [COMP, [/FROM document_formation df/, [[
        { document_id: 'g1', session_id: 's6a', year: 2026, week: 6, program_code: 'NIV1PRO', program_title: 'Pizzaïolo Niveau I PRO', debut: '2026-02-02', fin: '2026-02-06' },
        { document_id: 'g1', session_id: 's6b', year: 2026, week: 6, program_code: 'NIV1PRO', program_title: 'Pizzaïolo Niveau I PRO', debut: '2026-02-02', fin: '2026-02-06' },
    ]]]];
    const c = await suivi.lignesDuCoffre(faux.promise(), 'o1');
    assert.strictEqual(c.comp.length, 1, 'même nœud du coffre : le document ne s\'y montre qu\'une fois');
});
