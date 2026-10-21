/**
 * LE COFFRE SUPPRIME UN QCM ORPHELIN — relevé le 2026-10-21 (CHARLET Adeline) : des évaluations
 * restées dans le coffre, hors date (« (undefined) »), impossibles à retirer.
 *
 * Un QCM d'un dossier VIVANT reste protégé (sa réponse vit dans Résultats QCM, et l'espace du
 * stagiaire l'afficherait « jamais faite »). Mais un QCM ORPHELIN — plus aucune inscription derrière
 * lui (son dossier a été supprimé, `document_formation` parti par cascade) — n'a plus de dossier à
 * désynchroniser : la corbeille du coffre l'autorise, en emportant sa réponse éventuelle à la main
 * (`quiz_response.document_id` n'a pas de cascade). Les fichiers importés partent par cascade.
 */
const test = require('node:test');
const assert = require('node:assert');

const ORG = 'org-1';
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();

let gdocs, dforms, enrs, qresp, archives, journal;
function remettre() {
    gdocs = [
        { id: 'q-orph', organization_id: ORG, quiz_id: 'quiz1' }, // QCM orphelin : aucun document_formation
        { id: 'q-live', organization_id: ORG, quiz_id: 'quiz2' }, // QCM d'un dossier vivant
        { id: 'doc1', organization_id: ORG, quiz_id: null },      // document ordinaire
    ];
    dforms = [{ document_id: 'q-live', enrollment_id: 'enr1' }];  // seul q-live tient à une inscription
    enrs = ['enr1'];                                             // enr1 existe
    qresp = [{ id: 'r-orph', document_id: 'q-orph' }, { id: 'r-live', document_id: 'q-live' }];
    archives = [{ id: 'arch1', organization_id: ORG }];
    journal = [];
}
const orphelin = (docId) => !dforms.some((df) => df.document_id === docId && enrs.includes(df.enrollment_id));
const estQcm = (docId) => { const g = gdocs.find((x) => x.id === docId); return !!(g && g.quiz_id != null); };

async function requete(sql, params) {
    const q = plat(sql);
    if (/^DELETE FROM archive_document WHERE organization_id = \? AND id IN \(\?\)/.test(q)) {
        const ids = params[1]; const avant = archives.length;
        archives = archives.filter((a) => !(a.organization_id === params[0] && ids.includes(a.id)));
        return [{ affectedRows: avant - archives.length }];
    }
    if (/^DELETE qr FROM quiz_response qr JOIN generated_document gd/.test(q)) {
        const ids = params[1];
        qresp = qresp.filter((r) => !(ids.includes(r.document_id) && estQcm(r.document_id) && orphelin(r.document_id)));
        return [{ affectedRows: 0 }];
    }
    if (/^DELETE FROM generated_document WHERE organization_id = \? AND id IN \(\?\) AND \(quiz_id IS NULL OR/.test(q)) {
        const ids = params[1]; const avant = gdocs.length;
        gdocs = gdocs.filter((g) => !(g.organization_id === params[0] && ids.includes(g.id) && (g.quiz_id == null || orphelin(g.id))));
        return [{ affectedRows: avant - gdocs.length }];
    }
    return [[]];
}
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: requete }),
    query: (sql, params, cb) => { journal.push(plat(sql)); const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };
const suivi = require('../controllers/suivi.controller.js');

function rep() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    return res;
}
const supprimer = async (body) => { const res = rep(); await suivi.bulkDeleteArchive({ user: { organization_id: ORG, id: 'u1' }, body }, res); return res; };

test('un QCM ORPHELIN part (+ sa réponse), un QCM de dossier VIVANT reste protégé, et l\'archive PDF part', async () => {
    remettre();
    const res = await supprimer({ document_ids: ['q-orph', 'q-live', 'doc1'], archive_ids: ['arch1'] });
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.ok(!gdocs.some((g) => g.id === 'q-orph'), 'le QCM orphelin est supprimé');
    assert.ok(!gdocs.some((g) => g.id === 'doc1'), 'le document ordinaire est supprimé');
    assert.ok(gdocs.some((g) => g.id === 'q-live'), 'le QCM d\'un dossier vivant reste protégé');
    assert.ok(!qresp.some((r) => r.id === 'r-orph'), 'la réponse du QCM orphelin part avec lui');
    assert.ok(qresp.some((r) => r.id === 'r-live'), 'la réponse du QCM vivant reste');
    assert.strictEqual(archives.length, 0, 'l\'archive PDF est supprimée');
    assert.strictEqual(res.corps.deleted, 3, '1 archive + 2 documents (orphelin + ordinaire)');
});

test('un QCM de dossier VIVANT, seul, n\'est pas supprimé', async () => {
    remettre();
    const res = await supprimer({ document_ids: ['q-live'] });
    assert.strictEqual(res.corps.deleted, 0);
    assert.ok(gdocs.some((g) => g.id === 'q-live'), 'protégé');
    assert.ok(qresp.some((r) => r.id === 'r-live'), 'sa réponse reste');
});

test('rien à supprimer : 422', async () => {
    remettre();
    const res = await supprimer({ document_ids: [], archive_ids: [] });
    assert.strictEqual(res.code, 422);
});
