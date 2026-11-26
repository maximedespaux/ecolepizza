/**
 * LE PV NE PORTE PLUS AUCUNE MARQUE « PROJET » (demandé par l'école le 2026-11-26).
 *
 * Un bandeau rouge « PROJET — document de travail… » était ajouté en tête d'un PV tiré AVANT la
 * clôture, et « -projet » collé au nom du fichier (introduits le 2026-10-09, cf. l'ancien
 * pv-projet.test.js). L'école les a fait retirer : un PV généré avant clôture est désormais
 * IDENTIQUE au document officiel — même corps, même nom de fichier. L'écran rappelle toujours, lui,
 * qu'une commission non clôturée est un brouillon dont les décisions peuvent changer ; mais le
 * DOCUMENT, lui, ne porte plus rien.
 *
 * On capture ce qui part à l'imprimante (composeDocumentPdf simulé) : aucun bandeau, quel que soit
 * le statut de la commission.
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

test('AVANT CLÔTURE : aucun bandeau « PROJET », nom de fichier sans « -projet »', async () => {
    commission = { ...commission, status: 'OUVERTE' };
    const res = await rendre();
    assert.ok(/%PDF/.test(String(res.corps)), 'un PDF est rendu, même commission ouverte');
    assert.doesNotMatch(capture.bodyHtml, /PROJET/, 'plus de bandeau « projet » en tête');
    assert.match(capture.bodyHtml, /CORPS-DU-PV/, 'le corps du modèle est rendu tel quel');
    assert.match(res.headers['Content-Disposition'], /pv-EPJJD-2026-38\.pdf/);
    assert.doesNotMatch(res.headers['Content-Disposition'], /-projet/, 'plus de suffixe « -projet »');
});

test('APRÈS CLÔTURE : même rendu — aucun bandeau, même nom de fichier', async () => {
    commission = { ...commission, status: 'CLOTUREE' };
    const res = await rendre();
    assert.doesNotMatch(capture.bodyHtml, /PROJET/);
    assert.match(capture.bodyHtml, /CORPS-DU-PV/);
    assert.match(res.headers['Content-Disposition'], /pv-EPJJD-2026-38\.pdf/);
    assert.doesNotMatch(res.headers['Content-Disposition'], /-projet/);
});

/* ── Le câblage, lu au source ──────────────────────────────────────────────────────────────── */
test('contrôleur : plus aucune marque « projet » dans le rendu du PV', () => {
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'examen.controller.js'), 'utf8');
    assert.doesNotMatch(ctrl, /BANDEAU_PROJET/, 'le bandeau a disparu du contrôleur');
    assert.doesNotMatch(ctrl, /'-projet'/, 'plus de suffixe « -projet » dans le nom du fichier');
    assert.match(ctrl, /bodyHtml: content\.html/, 'le corps part tel quel, sans bandeau');
    assert.match(ctrl, /filename="pv-\$\{base\}\.pdf"/, 'nom de fichier sans marque');
});

test('écran : le fichier téléchargé ne porte plus « (projet) », et le PDF n\'est pas gardé par la clôture', () => {
    const jsx = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'components', 'CommissionJury.jsx'), 'utf8');
    assert.doesNotMatch(jsx, /disabled=\{!close\}/, 'les boutons PDF ne sont pas gardés par la clôture');
    assert.doesNotMatch(jsx, /\(projet\)/, 'plus de « (projet) » dans le nom du fichier');
    assert.doesNotMatch(jsx, /PDF marqué « projet »/, "plus d'info-bulle « PDF marqué projet »");
});
