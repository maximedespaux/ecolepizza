/**
 * LE « DROIT À L'IMAGE » PROPOSÉ À UNE PAGE BLANCHE (2026-09-22).
 *
 * Le modèle de l'école s'affiche « à créer » : son fichier Word n'est pas utilisé, et ses cases
 * « □ Autorise □ N'autorise pas » ne se cochaient pas en ligne. L'éditeur s'ouvre donc sur son
 * document, recomposé avec les jetons qui se cochent selon la réponse du stagiaire.
 *
 * CE QUI COMPTE, ET QUE CES TESTS GÈLENT : la proposition n'est JAMAIS écrite en base par ce chemin
 * (seul l'enregistrement la fait exister), elle ne remplace JAMAIS un modèle déjà composé, et elle ne
 * contient plus aucune case qu'on ne pourrait pas cocher.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

let ligneModele = null;   // la ligne `document_template` de l'organisme, ou rien
const ecritures = [];
const faux = {
    promise: () => ({
        query: async (sql) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (/^(INSERT|UPDATE|DELETE)/i.test(q)) ecritures.push(q);
            if (/^SELECT kind, body_html, header_html, footer_html, layout, file, name, mime FROM document_template WHERE organization_id = \? AND slug = \?/.test(q)) {
                return [ligneModele ? [ligneModele] : []];
            }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { getTemplateBody } = require('../controllers/template.controller.js');
const { MODELES_PROPOSES } = require('../lib/modelesProposes.js');
const { TOKEN_CATALOG, usedTokenKeys } = require('../lib/tokens.js');
const { finalitesDesJetons } = require('../lib/consentements.js');

async function corps(slug) {
    let data = null;
    const res = { status() { return this; }, json(b) { data = b.data; return this; } };
    await getTemplateBody({ user: { organization_id: 'o1' }, params: { slug } }, res);
    return data;
}
const PROPOSE = MODELES_PROPOSES['droit-image'];

test('une page blanche « droit-image » s\'ouvre sur le document proposé, annoncé comme tel', async () => {
    ligneModele = null;
    const d = await corps('droit-image');
    assert.strictEqual(d.body_html, PROPOSE.body);
    assert.match(d.propose, /Relisez-le/, 'l\'éditeur doit dire que rien n\'est encore enregistré');
    assert.deepStrictEqual(ecritures, [], 'PROPOSER N\'ÉCRIT RIEN : seul l\'enregistrement le fera exister');
});

test('le fichier Word ignoré de l\'école vaut page blanche — c\'est son cas en production', async () => {
    /* Relevé le 2026-09-22 : le modèle « droit-image » porte un fichier Word, mais son genre est
       resté « builder » sans corps. `getTemplateContent` le lit donc comme ABSENT, et la liste des
       modèles dit « à créer ». */
    ligneModele = { kind: 'builder', body_html: null, file: Buffer.from('PK'), name: 'Droit Image.docx' };
    assert.strictEqual((await corps('droit-image')).body_html, PROPOSE.body);
});

test('un modèle déjà composé n\'est JAMAIS remplacé', async () => {
    ligneModele = { kind: 'builder', body_html: '<p>Le texte de l’école</p>', header_html: '', footer_html: '', layout: null };
    const d = await corps('droit-image');
    assert.strictEqual(d.body_html, '<p>Le texte de l’école</p>');
    assert.ok(!d.propose, 'rien à proposer sur un modèle qui existe');
    /* Et un autre modèle vide ne reçoit rien de ce qui ne le concerne pas. */
    ligneModele = null;
    const autre = await corps('convention');
    assert.strictEqual(autre.body_html, '');
    assert.strictEqual(autre.propose, null);
});

test('le document proposé coche ses cases lui-même, et n\'en garde aucune à cocher à la main', () => {
    const cles = usedTokenKeys(PROPOSE.body);
    for (const k of ['Case photos oui', 'Case photos non', 'Case partenaires oui', 'Case partenaires non',
        'Données partenaires', 'Signature stagiaire']) {
        assert.ok(cles.has(k), `${k} doit figurer dans le modèle proposé`);
    }
    assert.doesNotMatch(PROPOSE.body, /[□☐☒]/, 'plus aucune case dessinée à la main : elles ne se cochaient pas');
    /* Chaque jeton existe au catalogue — sinon l'éditeur montrerait une puce inconnue, et le
       document imprimerait du vide. */
    const catalogue = new Set(TOKEN_CATALOG.flatMap((g) => g.tokens.map((t) => t.key)));
    for (const k of cles) assert.ok(catalogue.has(k), `« ${k} » n'est pas au catalogue`);
    assert.doesNotMatch(PROPOSE.body, /undefined/, 'chaque puce porte le libellé de la palette');
    /* Photos d'abord, partenaires ensuite : l'ordre du document, donc celui des questions. */
    assert.deepStrictEqual(finalitesDesJetons(cles), ['droit_image', 'partenaires']);
});

test('l\'éditeur montre la proposition jusqu\'au premier enregistrement', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'TemplateEditor.jsx'), 'utf8');
    assert.match(src, /setPropose\(d\.propose \|\| null\);/);
    assert.match(src, /\{propose && \(\s*<p className="tpl-propose" role="note">/);
    assert.match(src, /Modèle proposé, pas encore enregistré\./);
    const save = src.slice(src.indexOf('async function save()'));
    assert.ok(save.indexOf('setPropose(null)') > 0 && save.indexOf('setPropose(null)') < save.indexOf('catch (e)'),
        'la mention tombe une fois le modèle enregistré, pas avant');
});
