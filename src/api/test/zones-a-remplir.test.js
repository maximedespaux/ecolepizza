/**
 * LES ZONES À REMPLIR PAR LE STAGIAIRE (demandé le 2026-09-28) — lib/zonesARemplir.js.
 *
 * LE DÉFAUT DE DÉPART : l'attestation sur l'honneur d'expérience professionnelle (modèle
 * « attestation-honneur », signé par le stagiaire) porte des pointillés — « Entreprise / structure :
 * ……… », « Fonction exercée : ……… », « Période d'exercice : du ……… au ……… » — que personne ne pouvait
 * remplir en ligne : l'école ne connaît pas ces informations, et ne les stocke nulle part.
 * L'attestation se signait avec ses blancs.
 *
 * CE QUE L'ÉCOLE A DÉCIDÉ : une zone se pose dans l'éditeur (bouton « Zone à remplir », Texte ou
 * Date) ; le stagiaire la remplit depuis son espace, OU LE BUREAU POUR LUI ; TOUTES sont obligatoires
 * avant de signer ; signé, le document fige ses réponses.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · une zone vide s'imprime en POINTILLÉS (un document imprimé vierge se remplit au stylo), une
 *     zone remplie imprime sa réponse — échappée, les dates en JJ/MM/AAAA ;
 *   · les réponses sont CHIFFRÉES au repos, lues pour TOUS les rendus (loadContext) ;
 *   · un document aux zones vides NE SE SIGNE PAS — ni par l'espace, ni par le lien public ;
 *   · signé, plus rien ne change (409) ; sans la migration 185, rien ne casse ni ne bloque.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const Z = require('../lib/zonesARemplir.js');

/* Les puces de l'attestation, telles que l'éditeur les pose. */
const puce = (cle, libelle) => `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${libelle}">${libelle}</span>`;
const CORPS = `<p>Entreprise / structure : ${puce('saisie:texte:entreprise-structure', 'Entreprise / structure')}</p>`
    + `<p>Fonction exercée : ${puce('saisie:texte:fonction-exercee', 'Fonction exercée')}</p>`
    + `<p>Période d'exercice : du ${puce('saisie:date:du', 'Du')} au ${puce('saisie:date:au', 'Au')}</p>`
    + `<p>Signature du déclarant :</p><p>${puce('Signature stagiaire', 'Signature du stagiaire')}</p>`;
const REPONSES = {
    'saisie:texte:entreprise-structure': 'Pizzeria Da Mario',
    'saisie:texte:fonction-exercee': 'Pizzaïolo',
    'saisie:date:du': '2019-03-01',
    'saisie:date:au': '2021-06-30',
};

/* ── Une base factice : l'attestation d'un stagiaire, son modèle, ses réponses ───────────────────── */
let etat;
function reinitialiser(o = {}) {
    etat = {
        doc: { id: 'd1', type: 'ATTESTATION_HONNEUR', learner_id: 'l1', template_slug: 'attestation-honneur', title: 'Attestation sur l’honneur', status: 'ENVOYE', organization_id: 'o1', saisies: null },
        corps: CORPS,
        migration: true,           // la colonne `saisies` existe (migration 185)
        lien: { token: 't1', document_id: 'd1', slot: 'stagiaire', label: 'Signature', expire: 0, used_at: null },
        requetes: [],
        ...o,
    };
}
reinitialiser();
const sansColonne = () => Object.assign(new Error("Unknown column 'saisies'"), { code: 'ER_BAD_FIELD_ERROR' });
const ligneDoc = () => {
    const d = { ...etat.doc };
    if (!etat.migration) delete d.saisies; // `SELECT *` ne rend la clé que si la colonne existe
    return d;
};
function repondre(q, params) {
    if (/^SELECT d\.\* FROM generated_document d LEFT JOIN learner l/.test(q)) {
        const [, , userId, role] = params;
        // Les rôles admis sont LUS DANS LA REQUÊTE : c'est elle qu'on éprouve, pas une liste recopiée ici.
        const roles = ((/\? IN \(([^)]*)\)/.exec(q) || [])[1] || '').split(',').map((r) => r.trim().replace(/'/g, ''));
        return [userId === 'u1' || roles.includes(role) ? [ligneDoc()] : []];
    }
    if (/^SELECT d\.id, d\.type, d\.learner_id, d\.template_slug, d\.title FROM generated_document d/.test(q)) return [[etat.doc]];
    if (/^SELECT \* FROM generated_document WHERE id = \?/.test(q)) return [[ligneDoc()]];
    if (/^SELECT saisies FROM generated_document WHERE id = \?/.test(q)) {
        if (!etat.migration) throw sansColonne();
        return [[{ saisies: etat.doc.saisies }]];
    }
    if (/^UPDATE generated_document SET saisies = \?/.test(q)) { etat.doc.saisies = params[0]; return [{ affectedRows: etat.doc.status === 'SIGNE' ? 0 : 1 }]; }
    if (/FROM document_sign_link WHERE token = \?/.test(q)) return [[etat.lien]];
    if (/^SELECT kind, body_html, header_html, footer_html, layout, file, name, mime FROM document_template WHERE organization_id = \? AND slug = \?/.test(q)) {
        return [[{ kind: 'builder', body_html: etat.corps, header_html: '', footer_html: '', layout: null }]];
    }
    // Les étapes de l'organisme : l'attestation, signée par le stagiaire (comme en production).
    if (/FROM document_template WHERE organization_id = \?$/.test(q)) {
        return [[{ slug: 'attestation-honneur', label: 'Attestation sur l’honneur', doc_type: 'ATTESTATION_HONNEUR', kind: 'builder', sort_order: 50,
            signable: 1, stagiaire_sign: 1, applies_when: null, active: 1, deleted: 0, signers: '["STAGIAIRE"]', company_level: 0, company_sign: 0, has_file: 0, has_body: 1 }]];
    }
    if (/^SELECT id FROM learner WHERE id = \? AND user_id = \?/.test(q)) return [params[1] === 'u1' ? [{ id: 'l1' }] : []];
    if (/^SELECT user_id FROM learner WHERE id = \? AND organization_id = \?/.test(q)) return [[{ user_id: 'u1' }]];
    return [[]];
}
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            etat.requetes.push({ q, params });
            return repondre(q, params);
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

/* PAS DE LIBREOFFICE ICI : signer compose le PDF scellé — deux secondes de LibreOffice par test, et une
   dépendance de la machine. Comme sur un serveur sans LibreOffice, la signature s'enregistre et le
   scellement est différé (applyLearnerSignature l'attrape) : c'est la décision de signer qu'on observe. */
const cheminPdf = require.resolve('../lib/docxpdf.js');
const sansSoffice = () => { throw Object.assign(new Error('LibreOffice absent (banc de test)'), { code: 'NO_SOFFICE' }); };
require.cache[cheminPdf] = { id: cheminPdf, filename: cheminPdf, loaded: true, exports: { htmlToPdf: sansSoffice, docxToPdf: sansSoffice, convertToPdf: sansSoffice, findSoffice: () => null } };

/* ── Les règles ─────────────────────────────────────────────────────────────────────────────────── */
test('les zones d\'un modèle : dans l\'ordre du document, une fois chacune, avec leur libellé', () => {
    const zones = Z.zonesDuHtml(CORPS, `<p>${puce('saisie:texte:entreprise-structure', 'Entreprise (rappel)')}</p>`, '');
    assert.deepStrictEqual(zones.map((z) => [z.cle, z.type, z.libelle]), [
        ['saisie:texte:entreprise-structure', 'texte', 'Entreprise / structure'],
        ['saisie:texte:fonction-exercee', 'texte', 'Fonction exercée'],
        ['saisie:date:du', 'date', 'Du'],
        ['saisie:date:au', 'date', 'Au'],
    ], 'la même zone au pied ne se demande pas deux fois, sous son premier libellé');
    // Le libellé est décodé ; un type inconnu ou une clé mal formée n'est pas une zone.
    assert.deepStrictEqual(Z.zonesDuHtml(puce('saisie:texte:x', 'L&#39;entreprise &amp; « fils »')).map((z) => z.libelle), ["L'entreprise & « fils »"]);
    assert.deepStrictEqual(Z.zonesDuHtml(puce('saisie:heure:x', 'Heure') + puce('saisie:texte:', 'Vide') + puce('Nom', 'Nom')), []);
});

test('les réponses, mises au propre : une ligne, des dates qui existent, rien d\'étranger au modèle', () => {
    const zones = Z.zonesDuHtml(CORPS);
    const { valeurs, erreurs } = Z.normaliserSaisies(zones, {
        'saisie:texte:entreprise-structure': '  Pizzeria\n  Da   Mario ',
        'saisie:texte:fonction-exercee': '',
        'saisie:date:du': '2019-03-01',
        'saisie:texte:inconnue': 'ignorée',
    });
    assert.deepStrictEqual(erreurs, []);
    assert.deepStrictEqual(valeurs, { 'saisie:texte:entreprise-structure': 'Pizzeria Da Mario', 'saisie:date:du': '2019-03-01' },
        'une réponse vide n\'est pas gardée ; une clé que le modèle ne porte pas non plus');
    const faux = Z.normaliserSaisies(zones, { 'saisie:date:du': '2021-02-31', 'saisie:date:au': 'hier', 'saisie:texte:fonction-exercee': 'x'.repeat(Z.MAX_TEXTE + 1) });
    assert.deepStrictEqual(faux.valeurs, {});
    assert.strictEqual(faux.erreurs.length, 3, faux.erreurs.join(' | '));
    assert.match(faux.erreurs.join(' '), /« Du » : date invalide\./, 'le 31 février n\'existe pas');
    assert.match(faux.erreurs.join(' '), /200 caractères au plus/);
    assert.strictEqual(Z.normaliserSaisies(zones, 'pas un objet').valeurs && Object.keys(Z.normaliserSaisies(zones, null).valeurs).length, 0);
});

test('CE QUE LA ZONE IMPRIME : des pointillés tant qu\'elle est vide, puis la réponse — échappée, la date en clair', () => {
    assert.strictEqual(Z.rendreZone('saisie:texte:x', {}), '.'.repeat(60), 'à remplir au stylo sur un document imprimé vierge');
    assert.strictEqual(Z.rendreZone('saisie:date:du', {}), '........ / ........ / ............');
    assert.strictEqual(Z.rendreZone('saisie:date:du', REPONSES), '01/03/2019');
    assert.strictEqual(Z.rendreZone('saisie:texte:x', { 'saisie:texte:x': 'Chez <b>Mario</b> & fils' }), 'Chez &lt;b&gt;Mario&lt;/b&gt; &amp; fils');
    const { fillHtml } = require('../lib/htmlfill.js');
    const vierge = fillHtml(CORPS, { org: {}, learner: {} });
    assert.ok(vierge.includes(`Entreprise / structure : ${'.'.repeat(60)}`) && !vierge.includes('saisie:'), 'la puce devient ses pointillés');
    const rempli = fillHtml(CORPS, { org: {}, learner: {}, saisies: REPONSES });
    assert.match(rempli, /Entreprise \/ structure : Pizzeria Da Mario<\/p>/);
    assert.match(rempli, /du 01\/03\/2019 au 30\/06\/2021/);
});

test('les réponses sont CHIFFRÉES au repos, et une valeur illisible se lit « aucune réponse »', () => {
    const stocke = Z.ecrireSaisies(REPONSES);
    assert.match(stocke, /^enc:/, 'le parcours professionnel de quelqu\'un ne se lit pas en clair dans une sauvegarde');
    assert.ok(!stocke.includes('Mario'));
    assert.deepStrictEqual(Z.lireSaisies(stocke), REPONSES);
    for (const illisible of [null, '', 'enc:00:00:00', '[1,2]', 'du texte']) assert.deepStrictEqual(Z.lireSaisies(illisible), {}, String(illisible));
});

test('la clé posée par l\'ÉDITEUR est celle que le serveur lit', async () => {
    const { cleDeZone } = await import('../../app/ui/lib/zonesARemplir.js');
    for (const [libelle, type, attendue] of [
        ['Entreprise / structure', 'texte', 'saisie:texte:entreprise-structure'],
        ['Fonction exercée', 'texte', 'saisie:texte:fonction-exercee'],
        ['Du', 'date', 'saisie:date:du'],
        ['« Période » d\'exercice — début', 'date', 'saisie:date:periode-d-exercice-debut'],
        ['!!!', 'texte', 'saisie:texte:zone'],
        ['Un libellé vraiment très très long pour une zone de document', 'texte', 'saisie:texte:un-libelle-vraiment-tres-tres-long-pour'],
    ]) {
        const cle = cleDeZone(libelle, type);
        assert.strictEqual(cle, attendue, libelle);
        assert.ok(Z.lireCle(cle), `${cle} : le serveur la reconnaît`);
    }
});

const docCtrl = require('../controllers/document.controller.js');
const { getSignPage, submitSign } = require('../controllers/public.controller.js');

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';
async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; }, set() { return this; }, send() { return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ headers: {}, params: {}, query: {}, body: {}, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const stagiaire = { organization_id: 'o1', id: 'u1', role: 'STAGIAIRE' };
const bureau = { organization_id: 'o1', id: 'admin', role: 'SECRETARIAT' };
const formateur = { organization_id: 'o1', id: 'f1', role: 'FORMATEUR' };
const autre = { organization_id: 'o1', id: 'u2', role: 'STAGIAIRE' };

/* ── Remplir ────────────────────────────────────────────────────────────────────────────────────── */
test('LE STAGIAIRE REMPLIT ses zones : chiffrées en base, et relues par TOUS les rendus', async () => {
    reinitialiser();
    const r = await appeler(docCtrl.enregistrerSaisies, { user: stagiaire, params: { id: 'd1' }, body: { valeurs: REPONSES } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.match(r.corps.message, /le document peut être signé/);
    assert.match(etat.doc.saisies, /^enc:/, 'chiffrées au repos');
    assert.deepStrictEqual(Z.lireSaisies(etat.doc.saisies), REPONSES);
    // L'aperçu du document (getDocument → buildDocHtml → loadContext) les imprime à leur place.
    const vue = await appeler(docCtrl.getDocument, { user: stagiaire, params: { id: 'd1' } });
    assert.strictEqual(vue.code, 200, JSON.stringify(vue.corps));
    assert.match(vue.corps.data.html, /Pizzeria Da Mario/);
    assert.match(vue.corps.data.html, /du 01\/03\/2019 au 30\/06\/2021/);
    assert.deepStrictEqual(vue.corps.data.zones_a_remplir.map((z) => z.valeur), ['Pizzeria Da Mario', 'Pizzaïolo', '2019-03-01', '2021-06-30']);
});

test('LE BUREAU REMPLIT POUR LUI (décidé par l\'école) ; ni un formateur, ni un autre stagiaire', async () => {
    reinitialiser();
    const r = await appeler(docCtrl.enregistrerSaisies, { user: bureau, params: { id: 'd1' }, body: { valeurs: { 'saisie:date:du': '2019-03-01' } } });
    assert.strictEqual(r.code, 200);
    assert.match(r.corps.message, /3 zones restent à remplir/);
    assert.strictEqual((await appeler(docCtrl.enregistrerSaisies, { user: autre, params: { id: 'd1' }, body: { valeurs: REPONSES } })).code, 403);
    assert.strictEqual((await appeler(docCtrl.enregistrerSaisies, { user: formateur, params: { id: 'd1' }, body: { valeurs: REPONSES } })).code, 403);
    // Ce que l'écran en dit : qui peut remplir, et pour qui.
    const pourLui = await appeler(docCtrl.getDocument, { user: bureau, params: { id: 'd1' } });
    assert.deepStrictEqual([pourLui.corps.data.peut_remplir, pourLui.corps.data.remplit_pour_le_stagiaire], [true, true]);
    const lui = await appeler(docCtrl.getDocument, { user: stagiaire, params: { id: 'd1' } });
    assert.deepStrictEqual([lui.corps.data.peut_remplir, lui.corps.data.remplit_pour_le_stagiaire], [true, false]);
    const lecteur = await appeler(docCtrl.getDocument, { user: formateur, params: { id: 'd1' } });
    assert.strictEqual(lecteur.corps.data.peut_remplir, false, 'il voit ce qui manque, sans pouvoir le remplir');
    assert.strictEqual(lecteur.corps.data.zones_a_remplir.length, 4);
});

test('SIGNÉ, PLUS RIEN NE CHANGE ; une réponse invalide est refusée ; un document sans zone n\'en prend pas', async () => {
    reinitialiser({ doc: { ...etat.doc, status: 'SIGNE', saisies: Z.ecrireSaisies(REPONSES) } });
    const fige = await appeler(docCtrl.enregistrerSaisies, { user: stagiaire, params: { id: 'd1' }, body: { valeurs: { 'saisie:texte:fonction-exercee': 'Autre' } } });
    assert.strictEqual(fige.code, 409);
    assert.deepStrictEqual(Z.lireSaisies(etat.doc.saisies), REPONSES, 'la réponse signée est intacte');
    assert.strictEqual((await appeler(docCtrl.getDocument, { user: stagiaire, params: { id: 'd1' } })).corps.data.peut_remplir, false);
    reinitialiser();
    const date = await appeler(docCtrl.enregistrerSaisies, { user: stagiaire, params: { id: 'd1' }, body: { valeurs: { 'saisie:date:du': '2019-02-30' } } });
    assert.strictEqual(date.code, 422);
    assert.match(date.corps.message, /« Du » : date invalide/);
    reinitialiser({ corps: '<p>Rien à remplir</p>' });
    assert.strictEqual((await appeler(docCtrl.enregistrerSaisies, { user: stagiaire, params: { id: 'd1' }, body: { valeurs: REPONSES } })).code, 422);
});

/* ── Signer ─────────────────────────────────────────────────────────────────────────────────────── */
const signer = (user) => appeler(docCtrl.signDocument, { user, params: { id: 'd1' }, body: { signer_name: 'Camille BERGER', signature_data: SIGNATURE } });
const signe = () => etat.requetes.some((r) => /^UPDATE generated_document SET status = 'SIGNE'/.test(r.q));

test('UNE ZONE VIDE, PAS DE SIGNATURE — le stagiaire comme le bureau, et le message dit laquelle', async () => {
    reinitialiser({ doc: { ...etat.doc, saisies: Z.ecrireSaisies({ 'saisie:texte:entreprise-structure': 'Pizzeria Da Mario', 'saisie:date:du': '2019-03-01' }) } });
    for (const user of [stagiaire, bureau]) {
        const r = await signer(user);
        assert.strictEqual(r.code, 422, user.role);
        assert.match(r.corps.message, /^Complétez d'abord « Fonction exercée » et « Au »/);
        assert.deepStrictEqual(r.corps.zones, ['saisie:texte:fonction-exercee', 'saisie:date:au']);
    }
    assert.ok(!signe(), 'rien n\'a été signé');
});

test('toutes les zones remplies : la signature passe', async () => {
    reinitialiser({ doc: { ...etat.doc, saisies: Z.ecrireSaisies(REPONSES) } });
    await signer(stagiaire);
    assert.ok(signe(), 'la signature est enregistrée');
});

test('SANS LA MIGRATION 185, rien ne bloque et rien ne casse : pointillés, et signature comme avant', async () => {
    reinitialiser({ migration: false });
    const vue = await appeler(docCtrl.getDocument, { user: stagiaire, params: { id: 'd1' } });
    assert.strictEqual(vue.corps.data.zones_indisponibles, true, 'l\'écran le dit');
    assert.strictEqual(vue.corps.data.peut_remplir, false);
    assert.ok(vue.corps.data.html.includes('.'.repeat(60)), 'les zones s\'impriment en pointillés');
    const r = await appeler(docCtrl.enregistrerSaisies, { user: stagiaire, params: { id: 'd1' }, body: { valeurs: REPONSES } });
    assert.strictEqual(r.code, 503);
    assert.match(r.corps.message, /migration 185 non jouée/);
    await signer(stagiaire);
    assert.ok(signe(), 'bloquer sans moyen de remplir ferait pire qu\'imprimer des pointillés, comme avant');
});

test('LE LIEN PUBLIC (le représentant signe au nom du stagiaire) attend lui aussi les zones', async () => {
    reinitialiser();
    const page = await appeler(getSignPage, { params: { token: 't1' } });
    assert.match(page.corps.data.bloque, /attend encore les informations du stagiaire : « Entreprise \/ structure »/);
    const r = await appeler(submitSign, { params: { token: 't1' }, body: { signer_name: 'M. Représentant', signature_data: SIGNATURE } });
    assert.strictEqual(r.code, 422);
    assert.match(r.corps.message, /Il les remplit depuis son espace \(ou l'école pour lui\)/);
    assert.ok(!signe());
});

/* ── L'écran ────────────────────────────────────────────────────────────────────────────────────── */
test('L\'ÉCRAN : le formulaire avant le bouton « Signer », qui attend que tout soit rempli', () => {
    const vue = sansCommentaires(lire(path.join(UI, 'components/DocumentViewModal.jsx')));
    assert.match(vue, /const zonesVides = zones\.filter\(\(z\) => !z\.valeur\);/);
    assert.match(vue, /const showSign = [^;]*&& !zonesVides\.length;/, 'pas de bouton « Signer » tant qu\'une zone est vide');
    assert.match(vue, /doc\.peut_remplir \? \(\s*<ZonesARemplir documentId=\{id\} zones=\{zones\} pourLeStagiaire=\{!!doc\.remplit_pour_le_stagiaire\} onEnregistre=\{recharger\} \/>/,
        'le document relu relance l\'aperçu : on voit ses réponses à leur place avant de signer');
    const form = sansCommentaires(lire(path.join(UI, 'components/ZonesARemplir.jsx')));
    assert.match(form, /await enregistrerSaisies\(documentId, valeurs\);/, 'le formulaire ENTIER part (le serveur remplace)');
    assert.match(form, /type=\{z\.type === "date" \? "date" : "text"\}/);
    assert.match(form, /maxLength=\{z\.type === "date" \? undefined : 200\}/, 'la limite de l\'écran est celle du serveur');
    assert.strictEqual(Z.MAX_TEXTE, 200);
});

test('L\'ÉDITEUR : le bouton « Zone à remplir » (pas sur un modèle de groupe), et la puce n\'est pas « inconnue »', async () => {
    const editeur = sansCommentaires(lire(path.join(UI, 'pages/TemplateEditor.jsx')));
    assert.match(editeur, /\{!modeleEntreprise && \(\s*<div className="tok-group">\s*<div className="tok-group-hd"[^>]*><span><Icon name="pencil" size=\{13\} \/> Zones à remplir<\/span>/,
        'un document de groupe n\'a pas de stagiaire pour remplir');
    assert.match(editeur, /insertToken\(\{ token: cleDeZone\(lbl, zoneType\), label: lbl \}\)/);
    const couleurs = sansCommentaires(lire(path.join(UI, 'lib/categoryColors.js')));
    assert.match(couleurs, /k\.startsWith\("saisie:"\)/, 'sans quoi la puce s\'afficherait barrée, « ce jeton n\'existe plus »');
    // Et la rubrique : remplir ses zones est un acte de participant, comme signer.
    const { sectionFor } = require('../middlewares/sectionAccess.middleware.js');
    assert.strictEqual(sectionFor('documents', 'd1/saisies'), null);
    assert.strictEqual(sectionFor('documents', 'd1/sign'), null);
    assert.strictEqual(sectionFor('documents', 'd1/sign-link'), '/stagiaires', 'créer un lien reste un acte de bureau');
});
