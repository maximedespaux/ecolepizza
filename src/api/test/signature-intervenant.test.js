/**
 * LA SIGNATURE DE L'INTERVENANT : UN CADRE DÉDIÉ, QUE LES DEUX CHEMINS REMPLISSENT.
 *
 * DEMANDÉ LE 2026-09-21, après l'entreprise et l'organisme : « l'intervenant, même chose ».
 *
 * Le signataire « Externe » d'un modèle (case cochée dans Modèles) signe par DEUX chemins :
 *   · l'INTERVENANT, depuis son espace, un document de session qu'on lui a envoyé ;
 *   · n'importe qui d'autre (tuteur, financeur…), par le 🔗 lien externe d'un document.
 * Ils n'écrivaient pas au même endroit, et aucun n'était sûr :
 *   · l'espace remplissait « le PREMIER cadre du modèle » — celui du stagiaire, si « Stagiaire 1 »
 *     était placé plus haut ;
 *   · le lien écrivait dans un créneau nommé `external`, qu'aucun bloc de la palette ne produit
 *     (« Externe » donne `externe`) : la personne signait, et rien ne s'affichait nulle part.
 *
 * DÉSORMAIS : un bloc « Signature de l'intervenant » (clé FIXE `sig:intervenant`), offert sur les
 * modèles où « Externe » est coché, et que les deux chemins visent en priorité.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : le corps du modèle varie d'un test à l'autre ─────────────────────────────────
let corps = '';
let liens = [];
const puce = (cle, libelle) => `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${libelle}">${libelle}</span>`;
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/FROM document_template WHERE organization_id = \? AND slug = \?/.test(sql)) {
                return [[{ kind: 'builder', body_html: corps, header_html: '', footer_html: '', layout: null }]];
            }
            if (/SELECT id, template_slug FROM generated_document/.test(sql)) return [[{ id: 'd1', template_slug: 'convention-tuteur' }]];
            if (/INSERT INTO document_sign_link/.test(sql)) { liens.push(params); return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { creneauDuModele, CRENEAU_INTERVENANT } = require('../controllers/documentSession.controller.js');
const { createSignLink } = require('../controllers/document.controller.js');
const { fillHtml } = require('../lib/htmlfill.js');
const EDITEUR = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'TemplateEditor.jsx'), 'utf8');

test('LE BLOC DE LA PALETTE EST LE CRÉNEAU OÙ L\'INTERVENANT SIGNE', () => {
    const bloc = /const SIG_INTERVENANT = \{ key: "sig:([^"]+)", label: "([^"]+)" \};/.exec(EDITEUR);
    assert.ok(bloc, 'SIG_INTERVENANT introuvable dans l\'éditeur');
    assert.strictEqual(bloc[1], CRENEAU_INTERVENANT, 'un autre nom : un cadre que personne ne remplit');
    assert.strictEqual(bloc[2], 'Signature de l\'intervenant');
});

test('DEPUIS SON ESPACE : le cadre de l\'intervenant passe avant « le premier cadre »', async () => {
    corps = `<p>Stagiaire : ${puce('sig:stagiaire1', 'Stagiaire 1')}</p><p>Intervenant : ${puce('sig:intervenant', 'Signature de l\'intervenant')}</p>`;
    assert.strictEqual(await creneauDuModele('o1', 'contrat-hygiene'), 'intervenant',
        '« Stagiaire 1 » plus haut recevait la signature de l\'intervenant');
    // Les modèles d'avant restent servis : un cadre au nom choisi par l'école, ou la forme brute.
    corps = `<p>${puce('sig:tuteur', 'Tuteur')}</p>`;
    assert.strictEqual(await creneauDuModele('o1', 'x'), 'tuteur');
    corps = '<p>{sig:intervenant}</p>';
    assert.strictEqual(await creneauDuModele('o1', 'x'), 'intervenant');
    corps = '<p>Aucun cadre.</p>';
    assert.strictEqual(await creneauDuModele('o1', 'x'), 'externe');
});

async function lienExterne(body) {
    liens = [];
    let code = 200;
    const res = { status(c) { code = c; return this; }, json() { return this; } };
    await createSignLink({ params: { id: 'd1' }, body, user: { organization_id: 'o1', id: 'u1' }, headers: {}, ip: '127.0.0.1' }, res);
    return { code, slot: liens[0] && liens[0][3] };
}

test('PAR LE LIEN EXTERNE : même cadre — et jamais celui du stagiaire', async () => {
    corps = `<p>${puce('sig:stagiaire1', 'Stagiaire 1')}</p><p>${puce('sig:intervenant', 'Signature de l\'intervenant')}</p>`;
    assert.deepStrictEqual(await lienExterne({ slot: 'external', label: 'Signature externe' }), { code: 201, slot: 'intervenant' },
        'le lien écrivait dans « external », qu\'aucun cadre n\'affiche');
    // Sans cadre d'intervenant, on garde « external » : surtout pas « le premier cadre venu ».
    corps = `<p>${puce('sig:stagiaire1', 'Stagiaire 1')}</p>`;
    assert.strictEqual((await lienExterne({ slot: 'external' })).slot, 'external');
    // Les autres liens ne bougent pas : le représentant d'entreprise garde sa case.
    assert.strictEqual((await lienExterne({})).slot, 'representant');
});

test('LE MÊME CADRE que celui du stagiaire : vide avant, rempli après', () => {
    const intervenant = `<p>${puce('sig:intervenant', 'Signature de l\'intervenant')}</p>`;
    const vide = fillHtml(intervenant, { org: {}, learner: {} });
    const stagiaire = fillHtml(`<p>${puce('Signature stagiaire', 'Signature du stagiaire')}</p>`, { org: {}, learner: {} });
    const sansAlt = (h) => h.replace(/alt="[^"]*"/, 'alt=""');
    assert.strictEqual(sansAlt(vide), sansAlt(stagiaire));
    const IMAGE = 'data:image/png;base64,SU5URVJWRU5BTlQ=';
    const signe = fillHtml(intervenant, { org: {}, learner: {}, slotSignatures: { intervenant: { data: IMAGE, name: 'Jean Martin' } } });
    assert.ok(signe.includes(`<img src="${IMAGE}"`));
});

test('le bloc n\'est offert que sur un modèle signé par un externe — et remplace l\'ancien « Intervenant »', () => {
    const corpsCtrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'template.controller.js'), 'utf8');
    const debut = corpsCtrl.indexOf('const getTemplateBody');
    const fonction = corpsCtrl.slice(debut, corpsCtrl.indexOf('\n};', debut));
    assert.strictEqual((fonction.match(/company_level: companyLevel, signers,/g) || []).length, 3, 'le serveur dit qui signe');
    assert.match(EDITEUR, /setSigneParExterne\(Array\.isArray\(d\.signers\) && d\.signers\.includes\("EXTERNAL"\)\);/);
    assert.match(EDITEUR, /\{signeParExterne && \(\s*<button className="tok-chip" draggable/);
    /* L'ancien bloc nommé « Intervenant » était offert partout, y compris là où personne ne
       signe : un cadre voué à rester vide. */
    const presets = /const SIG_PRESETS = \[([^\]]*)\];/.exec(EDITEUR);
    assert.ok(presets && !/"Intervenant"/.test(presets[1]));
});
