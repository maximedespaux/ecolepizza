/**
 * « SANS EN-TÊTE » VEUT DIRE SANS EN-TÊTE — sur le document généré, pas seulement dans l'éditeur.
 *
 * DÉFAUT CONSTATÉ LE 2026-09-21 sur le certificat de réalisation d'une stagiaire : le modèle
 * `certificat-realisation` est réglé « sans en-tête » (`layout.noLetterhead`, en-tête vide) et son
 * aperçu dans l'éditeur n'en montrait aucun ; le PDF du document, lui, portait l'identité de
 * l'organisme en haut des deux pages — le papier à en-tête AUTOMATIQUE.
 *
 * LA CAUSE : le réglage n'était lu que par trois rendus sur sept. L'aperçu de l'éditeur, le PV du
 * jury et la facture passaient chacun leur propre `!(layout && layout.noLetterhead)` ; les quatre
 * rendus d'un document généré (PDF, aperçu, empreinte de signature, page du signataire externe)
 * n'en disaient rien, et `composeDocumentPdf` / `renderTemplateHtml` retombent alors sur « oui ».
 *
 * D'OÙ LE TEST D'INVARIANT ci-dessous : chaque appel de rendu, dans chaque contrôleur, doit DIRE
 * son choix par `avecPapierEnTete`. C'est lui qui aurait attrapé le défaut le jour où les rendus
 * des documents ont été écrits.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { renderTemplateHtml, avecPapierEnTete } = require('../lib/htmlfill.js');
const { computeReserves } = require('../lib/pdfcompose.js');

const ORG = { legal_name: 'ECOLE PIZZAIOLO Jean-Jacques DESPAUX', address: '101 rue Alsace Lorraine', zip_code: '65300', town: 'LANNEMEZAN', siret: '879 955 136 00012' };
// La forme exacte du modèle de production, relevée le 2026-09-21 (sans en-tête, pied de page à lui).
const CERTIFICAT = { header: '', footer: '<p>101 rue Alsace Lorraine 65300 LANNEMEZAN</p>', layout: { bleed: { body: false, footer: false, header: false }, noLetterhead: true } };

test('la règle : seul « sans en-tête » coupe le papier à en-tête', () => {
    assert.strictEqual(avecPapierEnTete({ noLetterhead: true }), false);
    for (const layout of [undefined, null, {}, { noLetterhead: false }, { bleed: {} }]) {
        assert.strictEqual(avecPapierEnTete(layout), true, `${JSON.stringify(layout)} : le papier à en-tête reste le défaut`);
    }
});

test('LE CERTIFICAT : ni en-tête dans le HTML, ni bandeau réservé dans le PDF', () => {
    const html = renderTemplateHtml('<p>Certificat</p>', { org: ORG },
        { headerHtml: CERTIFICAT.header, footerHtml: CERTIFICAT.footer, letterhead: avecPapierEnTete(CERTIFICAT.layout) });
    assert.doesNotMatch(html, /ECOLE PIZZAIOLO/, 'l\'identité de l\'organisme ne s\'ajoute plus en haut');
    assert.match(html, /101 rue Alsace Lorraine 65300/, 'le pied de page du modèle, lui, reste');
    // Côté PDF : sans bandeau d'en-tête, le corps démarre à la marge par défaut (20 mm).
    const sans = computeReserves({ headerHtml: '', ctx: { org: ORG }, useLetterhead: avecPapierEnTete(CERTIFICAT.layout) });
    const avec = computeReserves({ headerHtml: '', ctx: { org: ORG }, useLetterhead: avecPapierEnTete({}) });
    assert.strictEqual(sans.topMm, 20);
    assert.ok(avec.topMm > 20, 'un modèle sans réglage garde son papier à en-tête');
});

// ── L'invariant : tout rendu dit son choix ──────────────────────────────────────────────────
const CTRL = path.join(__dirname, '..', 'controllers');
/* Le texte des arguments d'un appel, parenthèses équilibrées : `(r.content.layout && …) || {}`
   ne doit pas couper l'appel au milieu. */
function argumentsDe(src, i) {
    const debut = src.indexOf('(', i);
    let n = 0;
    for (let j = debut; j < src.length; j++) {
        if (src[j] === '(') n++;
        else if (src[j] === ')' && --n === 0) return src.slice(debut, j + 1);
    }
    return src.slice(debut);
}

test('AUCUN RENDU NE RETOMBE EN SILENCE SUR LE PAPIER À EN-TÊTE', () => {
    const appels = [];
    for (const f of fs.readdirSync(CTRL).filter((x) => x.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(CTRL, f), 'utf8');
        for (const m of src.matchAll(/\b(renderTemplateHtml|composeDocumentPdf)\(/g)) {
            const ligne = src.slice(0, m.index).split('\n').length;
            appels.push({ ou: `${f}:${ligne}`, fn: m[1], args: argumentsDe(src, m.index) });
        }
    }
    assert.ok(appels.length >= 7, `les sept rendus sont trouvés (${appels.length})`);
    const muets = appels.filter((a) => !new RegExp(`${a.fn === 'composeDocumentPdf' ? 'useLetterhead' : 'letterhead'}: avecPapierEnTete\\(`).test(a.args));
    assert.deepStrictEqual(muets.map((a) => a.ou), [], 'ces rendus ne disent pas s\'ils veulent le papier à en-tête');
});

test('les quatre rendus d\'un document généré lisent le réglage DU MODÈLE', () => {
    const doc = fs.readFileSync(path.join(CTRL, 'document.controller.js'), 'utf8');
    const lus = doc.match(/(?:useLetterhead|letterhead): avecPapierEnTete\((?:r\.)?content\.layout\)/g) || [];
    assert.strictEqual(lus.length, 4, 'PDF, aperçu, empreinte de signature, page du signataire externe');
});

// ── Qui a préparé ce document ? ─────────────────────────────────────────────────────────────
test('PRÉPARER UN DOCUMENT EST JOURNALISÉ', () => {
    /* Seul geste du circuit qui ne l'était pas. Le 2026-09-21, personne ne pouvait dire qui avait
       préparé le certificat en cause, ni quand. */
    const doc = fs.readFileSync(path.join(CTRL, 'document.controller.js'), 'utf8');
    const creation = doc.slice(doc.indexOf('const createDocument = async'), doc.indexOf("res.status(201).json({ message: 'Document préparé'"));
    const preparation = creation.indexOf('await prepareLearnerDoc(');
    const journal = creation.indexOf("logAudit(req, 'document.create', 'GeneratedDocument', documentId);");
    assert.ok(preparation > 0 && journal > preparation, 'journalisé une fois le document créé, pas avant');
    const LIBELLES = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'auditLabels.js'), 'utf8');
    /* Le libellé existait déjà : il attendait un code qu'aucun contrôleur ne posait. */
    assert.match(LIBELLES, /'document\.create': \['Document préparé', [A-Z]\]/);
});
