/**
 * LA SIGNATURE DE L'ORGANISME : UN CADRE VIDE JUSQU'À CE QU'IL SIGNE.
 *
 * DEMANDÉ LE 2026-09-21, après le cadre « Cachet de l'entreprise » : « l'organisme, même chose ».
 *
 * LE DÉFAUT. L'organisme signe EN DERNIER — juste après le stagiaire ou l'entreprise, ou à l'envoi
 * quand il signe seul — et c'est à ce moment que sa signature est apposée sur le document
 * (`org_signature_data`). Mais le rendu imprimait sa signature ENREGISTRÉE dès le premier aperçu :
 * un contrat envoyé au stagiaire portait la signature de l'école avant la sienne, pendant que le
 * cadre du stagiaire, lui, attendait vide. Le document disait « signé par l'organisme » avant que
 * l'organisme ait signé quoi que ce soit.
 *
 * CE QUI NE CHANGE PAS : sur un document que l'organisme ne signe pas (livret d'accueil…), rien
 * ne viendrait jamais remplir le cadre — sa signature enregistrée s'y imprime, comme avant.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ENREGISTREE = 'data:image/png;base64,RU5SRUdJU1RSRUU=';
const APPOSEE = 'data:image/png;base64,QVBQT1NFRQ==';
const CORPS = '<p>Pour l\'organisme : <span class="doc-token" contenteditable="false" data-token="Signature organisme" '
    + 'data-label="Signature de l\'organisme">Signature de l\'organisme</span></p>';

// ── Fausse base : un organisme avec sa signature enregistrée, un document, son modèle ──────────
let documentCourant = null;
const faux = {
    promise: () => ({
        query: async (sql) => {
            if (/FROM organization WHERE id = \?/.test(sql)) return [[{ id: 'o1', legal_name: 'École Pizza', signature_image: ENREGISTREE }]];
            if (/SELECT org_signature_data, template_slug, type FROM generated_document/.test(sql)) return [[documentCourant]];
            if (/FROM document_template WHERE organization_id = \? AND slug = \?/.test(sql)) {
                return [[{ kind: 'builder', body_html: CORPS, header_html: '', footer_html: '', layout: null }]];
            }
            return [[]];   // le reste du dossier est vide : seul le cadre de l'organisme compte ici
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { renderDocumentHtml } = require('../controllers/document.controller.js');
const { signatureOrganismeAffichee } = require('../lib/documents.js');
const { fillHtml } = require('../lib/htmlfill.js');

/** Rend le vrai document ; `apposee` : la signature que l'organisme y a apposée, ou rien. */
async function rendre(slug, type, apposee) {
    documentCourant = { org_signature_data: apposee, template_slug: slug, type };
    const erreurs = console.error; console.error = () => {};
    try {
        return await renderDocumentHtml(faux.promise(), 'o1', { id: 'd1', learner_id: null, template_slug: slug, title: slug, type });
    } finally { console.error = erreurs; }
}
/** Le cadre VIDE de l'organisme : l'image transparente, son libellé, la bordure en pointillés. */
const cadreVide = (h) => /<img src="data:image\/gif;base64,[^"]+" alt="Signature de l'organisme" width="200" height="64" style="[^"]*border:1px dashed/.test(h);

test('UN CONTRAT ENVOYÉ, PAS ENCORE SIGNÉ : le cadre de l\'organisme est vide', async () => {
    const html = await rendre('contrat', 'CONTRAT', null);
    assert.ok(html, 'le document doit se rendre');
    assert.ok(!html.includes(ENREGISTREE), 'la signature de l\'école s\'imprimait avant même celle du stagiaire');
    assert.ok(cadreVide(html), 'un espace blanc bordé de pointillés, là où l\'organisme signera');
});

test('LE STAGIAIRE A SIGNÉ, L\'ORGANISME A CONTRESIGNÉ : sa signature remplit le cadre', async () => {
    const html = await rendre('contrat', 'CONTRAT', APPOSEE);
    assert.ok(html.includes(`<img src="${APPOSEE}"`), 'celle APPOSÉE sur ce document');
    assert.ok(!html.includes(ENREGISTREE), 'et non celle enregistrée aujourd\'hui dans Organisme');
});

test('L\'ORGANISME SIGNE SEUL (certificat de réalisation) : vide avant l\'envoi, signé à l\'envoi', async () => {
    assert.ok(cadreVide(await rendre('certificat-realisation', 'CERTIFICAT_REALISATION', null)));
    assert.ok((await rendre('certificat-realisation', 'CERTIFICAT_REALISATION', APPOSEE)).includes(`<img src="${APPOSEE}"`));
});

test('UN DOCUMENT QUE L\'ORGANISME NE SIGNE PAS garde sa signature imprimée, comme avant', async () => {
    // Le livret d'accueil n'a aucun signataire : rien ne remplirait jamais le cadre.
    const html = await rendre('livret-accueil', 'LIVRET_ACCUEIL', null);
    assert.ok(html.includes(`<img src="${ENREGISTREE}"`));
});

test('la règle, cas par cas', () => {
    assert.strictEqual(signatureOrganismeAffichee(ENREGISTREE, null, true), null, 'attendue, pas encore apposée : vide');
    assert.strictEqual(signatureOrganismeAffichee(ENREGISTREE, APPOSEE, true), APPOSEE);
    assert.strictEqual(signatureOrganismeAffichee(ENREGISTREE, null, false), ENREGISTREE, 'non signataire : imprimée');
    assert.strictEqual(signatureOrganismeAffichee(null, null, false), null);
});

test('LE MÊME CADRE que celui du stagiaire', () => {
    const puce = (cle, libelle) => `<p><span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${libelle}">${libelle}</span></p>`;
    const organisme = fillHtml(puce('Signature organisme', 'Signature de l\'organisme'), { org: { signature_image: null }, learner: {} });
    const stagiaire = fillHtml(puce('Signature stagiaire', 'Signature du stagiaire'), { org: {}, learner: {} });
    const sansAlt = (h) => h.replace(/alt="[^"]*"/, 'alt=""');
    assert.strictEqual(sansAlt(organisme), sansAlt(stagiaire));
});

test('la palette range la signature de l\'organisme parmi les Signatures, et Réglages dit quand elle apparaît', () => {
    const ui = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
    const editeur = ui('pages/TemplateEditor.jsx');
    /* Le jeton INTÉGRÉ, celui que l'éditeur dessine en cadre (TokenView.isSig) et que le rendu
       remplit : une autre clé ferait un cadre que rien ne remplit. */
    assert.match(editeur, /const SIG_ORGANISME = \{ key: "Signature organisme", label: "Signature de l'organisme" \};/);
    assert.match(editeur, /insertToken\(\{ token: SIG_ORGANISME\.key, label: SIG_ORGANISME\.label \}\)/);
    assert.match(ui('lib/TokenView.jsx'), /t === "Signature organisme"/);
    // Réglages disait « insérée automatiquement sur les documents » : ce n'est plus vrai avant la signature.
    const reglages = ui('pages/Reglages.jsx');
    assert.doesNotMatch(reglages, /Image insérée automatiquement sur les documents/);
    assert.match(reglages, /le cadre reste vide d'ici là/);
});
