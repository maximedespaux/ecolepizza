/**
 * LE PV SE TÉLÉCHARGE AVANT LA CLÔTURE, MARQUÉ « PROJET » (demandé le 2026-10-09).
 *
 * L'école envoie le procès-verbal aux membres du jury AVANT la séance, pour qu'ils le préparent.
 * Le PDF n'est donc plus réservé à l'après-clôture — mais tiré avant, il porte un BANDEAU rouge
 * « PROJET » et un « -projet » dans le nom du fichier, pour ne pas se confondre avec le PV signé.
 * Une fois la commission clôturée, ni bandeau ni suffixe : c'est la pièce officielle.
 *
 * On capture ce qui part à l'imprimante (composeDocumentPdf simulé) : le bandeau est ajouté en tête
 * du corps UNIQUEMENT quand la commission n'est pas clôturée.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

let commission = { id: 'ex-1', status: 'OUVERTE', pv_ref: 'EPJJD-2026-38', jury: '[]', date_examen: '2026-12-18' };
const faux = {
    promise: () => ({
        query: async (sql) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            if (/FROM exam_session/i.test(sql)) return [[commission]];
            if (/FROM exam_result/i.test(sql)) return [[]];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [[{ learner_id: 'l-1', first_name: 'Jérémy', last_name: 'HANY' }]];
            if (/FROM organization/i.test(sql)) return [[{ id: 'o1', name: 'École Pizza' }]];
            if (/FROM document_template/i.test(sql)) return [[{ kind: 'builder', body_html: '<p>CORPS-DU-PV</p>', header_html: '', footer_html: '', layout: null }]];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
require.cache[require.resolve('../config/database.js')] = { id: require.resolve('../config/database.js'), filename: require.resolve('../config/database.js'), loaded: true, exports: faux };

// L'imprimante PDF est simulée : on retient le corps qu'on lui donne, et on rend un faux PDF.
let capture = null;
const cheminPdf = require.resolve('../lib/pdfcompose.js');
require.cache[cheminPdf] = { id: cheminPdf, filename: cheminPdf, loaded: true, exports: { composeDocumentPdf: async (opts) => { capture = opts; return Buffer.from('%PDF-1.4 faux'); } } };

const { pvPdf } = require('../controllers/examen.controller.js');

function faireRes() {
    const res = { code: 200, headers: {}, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    res.set = (k, v) => { res.headers[k] = v; return res; };
    res.send = (b) => { res.corps = b; return res; };
    return res;
}
const rendre = async () => {
    capture = null;
    const res = faireRes();
    await pvPdf({ user: { organization_id: 'o1', id: 'u1' }, params: { id: 's-1' }, headers: {} }, res);
    return res;
};

test('AVANT CLÔTURE : bandeau « PROJET » en tête, et « -projet » dans le nom du fichier', async () => {
    commission = { ...commission, status: 'OUVERTE' };
    const res = await rendre();
    assert.ok(/%PDF/.test(String(res.corps)), 'un PDF est rendu, même commission ouverte');
    assert.match(capture.bodyHtml, /PROJET — document de travail/, 'le bandeau est en tête');
    assert.ok(capture.bodyHtml.indexOf('PROJET') < capture.bodyHtml.indexOf('CORPS-DU-PV'), 'bandeau AVANT le corps');
    assert.match(res.headers['Content-Disposition'], /pv-EPJJD-2026-38-projet\.pdf/);
});

test('APRÈS CLÔTURE : aucun bandeau, nom sans « -projet » (document officiel)', async () => {
    commission = { ...commission, status: 'CLOTUREE' };
    const res = await rendre();
    assert.doesNotMatch(capture.bodyHtml, /PROJET/, 'le document signé ne porte pas « projet »');
    assert.match(capture.bodyHtml, /CORPS-DU-PV/);
    assert.match(res.headers['Content-Disposition'], /pv-EPJJD-2026-38\.pdf/);
    assert.doesNotMatch(res.headers['Content-Disposition'], /-projet/);
});

/* ── Le câblage, lu au source ──────────────────────────────────────────────────────────────── */
test('contrôleur : le bandeau n\'est ajouté QUE pour un PV non clôturé', () => {
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'examen.controller.js'), 'utf8');
    assert.match(ctrl, /const brouillon = ctx\.exam\.status !== 'CLOTUREE'/);
    assert.match(ctrl, /brouillon \? BANDEAU_PROJET \+ content\.html : content\.html/);
    assert.match(ctrl, /brouillon \? '-projet' : ''/);
});

test('écran : le PDF n\'est plus bloqué avant clôture, et le brouillon se nomme « (projet) »', () => {
    const jsx = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'components', 'CommissionJury.jsx'), 'utf8');
    // Plus aucun bouton PDF désactivé tant que la commission n'est pas clôturée.
    assert.doesNotMatch(jsx, /disabled=\{!close\}/, 'les boutons PDF ne sont plus gardés par la clôture');
    // Le nom du fichier téléchargé porte « (projet) » avant clôture.
    assert.match(jsx, /close \? "" : " \(projet\)"/);
});
