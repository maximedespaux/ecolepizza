/**
 * LE DROIT À L'IMAGE — une réponse du stagiaire, et le document qui l'imprime (demandé le 2026-09-22).
 *
 * LE DÉFAUT DE DÉPART : le document « Droit à l'image » de l'école portait « □ Autorise
 * □ N'autorise pas », deux cases que personne ne pouvait cocher en ligne. Le stagiaire signait un
 * PDF qui ne disait pas ce qu'il avait choisi. Et ce seul choix couvrait deux choses — les photos,
 * et la transmission de ses coordonnées aux partenaires, que l'application demande déjà à part.
 *
 * CE QUE L'ÉCOLE A CHOISI : un seul document, dont les cases se cochent d'elles-mêmes selon la
 * réponse ; deux réponses distinctes (photos, partenaires) ; la question posée dans l'espace du
 * stagiaire ET, si elle reste sans réponse, au moment de signer.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · la réponse vit au REGISTRE des consentements (datée, avec sa phrase), pas dans une colonne ;
 *   · le document l'imprime À LA DATE DE SA SIGNATURE — un retrait ultérieur ne le réécrit pas ;
 *   · un document qui imprime une réponse absente NE SE SIGNE PAS, par aucune des routes ;
 *   · seul le stagiaire répond : le personnel et le représentant sont prévenus, pas invités.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* ── UNE BASE FACTICE ───────────────────────────────────────────────────────────────────────────
   Un document « Droit à l'image » de stagiaire, son modèle (qui porte ou non les jetons), les
   réponses au registre. Tout le reste répond vide — assez pour que les routes aillent jusqu'à la
   décision qu'on veut observer. */
const CORPS_PHOTOS = '<p><span class="doc-token" data-token="Case photos oui">P</span> Autorise '
    + '<span class="doc-token" data-token="Case photos non">P</span> N’autorise pas</p>';
let etat;
function reinitialiser(o = {}) {
    etat = {
        doc: { id: 'd1', type: 'DROIT_IMAGE', learner_id: 'l1', template_slug: 'droit-image', title: 'Droit à l’image', status: 'ENVOYE', organization_id: 'o1' },
        corps: CORPS_PHOTOS,
        reponses: [],           // lignes du registre, la plus récente d'abord
        lien: { token: 't1', document_id: 'd1', slot: 'stagiaire', label: 'Signature', expire: 0, used_at: null },
        requetes: [],
        ...o,
    };
}
reinitialiser();
function repondre(q) {
    if (/^SELECT d\.id, d\.type, d\.learner_id, d\.template_slug, d\.title FROM generated_document d/.test(q)) return [[etat.doc]];
    if (/^SELECT \* FROM generated_document WHERE id = \?/.test(q)) return [[etat.doc]];
    if (/FROM document_sign_link WHERE token = \?/.test(q)) return [[etat.lien]];
    if (/^SELECT kind, body_html, header_html, footer_html, layout, file, name, mime FROM document_template WHERE organization_id = \? AND slug = \?/.test(q)) {
        return [[{ kind: 'builder', body_html: etat.corps, header_html: '', footer_html: '', layout: null }]];
    }
    /* L'état courant (etatCourant) : la dernière réponse de chaque finalité. */
    if (/FROM consent_record c JOIN \(SELECT finalite, MAX\(decide_at\)/.test(q)) {
        const vues = new Set();
        return [etat.reponses.filter((r) => !vues.has(r.finalite) && vues.add(r.finalite))
            .map((r) => ({ destinataires: '', formulation: '', source: 'espace_stagiaire', champs: null, decide_at: '2026-09-22 10:00', ...r }))];
    }
    /* Les réponses à la date du document (reponsesDuDocument). */
    if (/^SELECT finalite, accorde, (champs|NULL AS champs) FROM consent_record/.test(q)) return [etat.reponses];
    if (/^SELECT partner_fields FROM organization/.test(q)) return [[{ partner_fields: 'nom,prenom,email' }]];
    if (/^SELECT id FROM learner WHERE id = \? AND user_id = \?/.test(q)) return [[{ id: 'l1' }]];
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

const lib = require('../lib/consentements.js');
const { TOKEN_CATALOG, OPTIONAL_TOKENS, findMissingTokens, resolveTokens } = require('../lib/tokens.js');
const { jetonsDuDocx } = require('../lib/docxfill.js');
const docCtrl = require('../controllers/document.controller.js');
const { getSignPage, submitSign } = require('../controllers/public.controller.js');
const { getSessionConsents, setConsentPourStagiaire } = require('../controllers/consentement.controller.js');

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
const bureau = { organization_id: 'o1', id: 'admin', role: 'ADMIN_ORGANISME' };

// ── Le registre ──────────────────────────────────────────────────────────────────────────────

test('le droit à l\'image est une question du registre, à part des partenaires', () => {
    /* ACCEPTER L'UN NE VAUT PAS ACCEPTER L'AUTRE. Le document de l'école les réunissait sous une
       seule réponse ; un consentement est spécifique, et chacun se retire seul. */
    const f = lib.FINALITES.droit_image;
    assert.ok(f, 'la finalité doit exister');
    assert.deepStrictEqual(lib.FINALITES_CONNUES, ['partenaires', 'droit_image']);
    assert.match(f.formulation, /photographies/);
    assert.match(f.formulation, /site internet/);
    assert.match(f.formulation, /Refuser n'a aucune conséquence/, 'un refus sans conséquence, dit comme tel');
    assert.match(f.formulation, /depuis mon profil/, 'et le chemin du retour');
    /* Les colonnes du registre : 600 et 500 caractères. Une phrase coupée à l'écriture ne serait
       plus celle que la personne a lue. */
    assert.ok(f.formulation.length <= 600 && f.destinataires.length <= 500);
    assert.strictEqual(f.titreDestinataires, 'Où ces photos peuvent paraître',
        'pour des photos, l\'encadré dit OÙ, pas « qui recevra ces informations »');
});

test('une réponse s\'enregistre avec SA phrase, sans liste de champs', async () => {
    const ecrites = [];
    const conn = { query: async (sql, params) => { ecrites.push({ sql, params }); return [{}]; } };
    const r = await lib.enregistrer(conn, { orgId: 'o1', learnerId: 'l1', finalite: 'droit_image', accorde: false, source: 'papier', saisiPar: 'admin' });
    assert.deepStrictEqual(r, { ok: true });
    assert.strictEqual(ecrites.length, 1, 'une ligne, et rien d\'autre à lire : pas de partenaires, pas de champs');
    const { sql, params } = ecrites[0];
    assert.match(sql, /INSERT INTO consent_record/);
    assert.doesNotMatch(sql, /champs/, 'la colonne des champs ne concerne que les partenaires');
    assert.deepStrictEqual(params, ['o1', 'l1', 'droit_image', 0, lib.FINALITES.droit_image.destinataires,
        lib.FINALITES.droit_image.formulation, 'papier', 'admin']);
});

test('un refus aux photos ne se redemande pas', async () => {
    reinitialiser({ reponses: [{ finalite: 'droit_image', accorde: 0 }] });
    const liste = await lib.etatCourant(faux.promise(), 'o1', 'l1');
    const photos = liste.find((f) => f.cle === 'droit_image');
    assert.strictEqual(photos.accorde, false);
    assert.deepStrictEqual(photos.ajoutes, [], 'rien ne doit rouvrir la question');
    assert.strictEqual(photos.formulation, lib.FINALITES.droit_image.formulation);
    assert.strictEqual(liste.find((f) => f.cle === 'partenaires').accorde, null, 'l\'autre question reste entière');
});

// ── Ce que le document imprime ───────────────────────────────────────────────────────────────

test('les cases se cochent selon la réponse, et restent vides sans elle', () => {
    const sans = lib.valeursJetons({ reponses: {}, champsDuJour: ['nom'] });
    assert.strictEqual(sans['Case photos oui'], '☐');
    assert.strictEqual(sans['Case photos non'], '☐', 'sans réponse, AUCUNE case ne se coche');
    assert.strictEqual(sans['Choix photos'], '');
    const oui = lib.valeursJetons({ reponses: { droit_image: { accorde: true } } });
    assert.strictEqual(oui['Case photos oui'], '☒');
    assert.strictEqual(oui['Case photos non'], '☐');
    assert.strictEqual(oui['Choix photos'], 'autorise');
    const non = lib.valeursJetons({ reponses: { partenaires: { accorde: false, champs: ['nom'] } } });
    assert.strictEqual(non['Case partenaires non'], '☒');
    assert.strictEqual(non['Choix partenaires'], 'n’autorise pas');
    assert.strictEqual(non['Case photos oui'], '☐', 'une réponse aux partenaires ne coche rien côté photos');
});

test('{Données partenaires} dit ce qui a été ANNONCÉ à la personne, pas la liste du jour', () => {
    /* Le document de l'école écrivait sa propre liste (« nom, prénom, adresse postale… ») à côté de
       celle que l'application annonçait : deux textes pour un même accord. Le jeton lit la liste
       figée avec la réponse — celle du jour seulement si la personne n'a pas encore répondu. */
    const v = lib.valeursJetons({ reponses: { partenaires: { accorde: true, champs: ['nom', 'email'] } }, champsDuJour: ['nom', 'email', 'telephone'] });
    /* ET L'IDENTITÉ N'Y EST PLUS (2026-09-23) : le document écrit « ☐ Autorise ☐ N'autorise pas …
       à transmettre {Données partenaires} ». Y laisser le nom ferait signer que refuser le
       retient, alors qu'il part dans tous les cas depuis que l'école l'a décidé. Il a son propre
       jeton, et sa propre phrase sous la case. */
    assert.strictEqual(v['Données partenaires'], 'mon adresse e-mail');
    assert.strictEqual(v['Identité partenaires'], 'mon nom');
    const jamais = lib.valeursJetons({ reponses: {}, champsDuJour: ['nom', 'prenom', 'telephone'] });
    assert.strictEqual(jamais['Données partenaires'], 'mon téléphone');
    assert.strictEqual(jamais['Identité partenaires'], 'mon nom et mon prénom');
    /* L'ÉCOLE PEUT DÉCIDER DE NE PAS TRANSMETTRE LE NOM : le jeton sort alors vide, et la phrase
       du modèle disparaît avec lui plutôt que d'annoncer une transmission qui n'a pas lieu. */
    assert.strictEqual(lib.valeursJetons({ reponses: {}, champsDuJour: ['email'] })['Identité partenaires'], '');
});

test('un document signé garde la réponse du jour de sa signature', async () => {
    /* Un stagiaire qui retire son accord en juin ne change pas ce que montre le document signé en
       mars. LA BORNE EST DANS LA REQUÊTE — la date de signature lue par la base elle-même, sans
       aller-retour par une date JavaScript (le décalage de fuseau a déjà coûté deux heures à un
       lien de signature). */
    reinitialiser({ reponses: [{ finalite: 'droit_image', accorde: 1, champs: null }, { finalite: 'droit_image', accorde: 0, champs: null }] });
    const par = await lib.reponsesDuDocument(faux.promise(), 'o1', 'l1', 'd1');
    const req = etat.requetes.find((r) => /FROM consent_record/.test(r.q));
    assert.match(req.q, /decide_at <= COALESCE\(\(SELECT signed_at FROM generated_document WHERE id = \?\), decide_at\)/);
    assert.deepStrictEqual(req.params, ['o1', 'l1', 'd1']);
    assert.strictEqual(par.droit_image.accorde, true, 'la plus récente (la première rendue) l\'emporte');
});

test('sans registre, le document reste lisible : cases vides', async () => {
    const conn = { query: async () => { throw Object.assign(new Error('x'), { code: 'ER_NO_SUCH_TABLE' }); } };
    assert.strictEqual(await lib.reponsesDuDocument(conn, 'o1', 'l1', 'd1'), null);
    assert.strictEqual(resolveTokens({})['Case photos oui'], '☐');
});

test('les jetons sont au catalogue, et ne bloquent JAMAIS la génération', () => {
    const g = TOKEN_CATALOG.find((x) => x.group === 'Autorisations');
    assert.ok(g, 'le groupe doit exister');
    const cles = g.tokens.map((t) => t.key);
    assert.deepStrictEqual(cles.sort(), Object.keys(lib.JETONS_CONSENTEMENT).sort(),
        'chaque jeton du groupe sait quelle question il imprime, et inversement');
    /* VIDES TANT QU'IL N'A PAS RÉPONDU : c'est la signature qui l'exige, pas la génération. Comptés
       « manquants », ils bloqueraient l'aperçu du document — celui-là même où la question se pose. */
    for (const k of cles) assert.ok(OPTIONAL_TOKENS.has(k), `${k} doit être facultatif à la génération`);
    assert.deepStrictEqual(findMissingTokens([CORPS_PHOTOS + '<p>{Choix photos}</p>'], {}), []);
});

test('un modèle Word coupé en morceaux livre quand même ses jetons', () => {
    /* Word coupe souvent un jeton en plusieurs morceaux de texte (une correction, une police). */
    const zip = new PizZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>{Case photos</w:t></w:r>'
        + '<w:r><w:t xml:space="preserve"> oui} Autorise</w:t></w:r></w:p></w:body></w:document>');
    zip.file('word/footer1.xml', '<w:ftr><w:p><w:r><w:t>{Choix partenaires}</w:t></w:r></w:p></w:ftr>');
    const cles = jetonsDuDocx(zip.generate({ type: 'nodebuffer' }));
    assert.ok(cles.has('Case photos oui'));
    assert.ok(cles.has('Choix partenaires'), 'les pieds de page comptent aussi');
    /* DANS L'ORDRE DU DOCUMENT : les photos d'abord, puisqu'elles y sont imprimées d'abord. */
    assert.deepStrictEqual(lib.finalitesDesJetons(cles), ['droit_image', 'partenaires']);
});

test('les questions se posent dans l\'ordre où le document les imprime', async () => {
    /* « 1. Photographies », « 2. Partenaires » : répondre dans un autre ordre obligerait à relire le
       document à l'envers. Le registre, lui, range les partenaires en premier — ce n'est pas lui
       qui doit dicter l'ordre de lecture. */
    reinitialiser({ corps: '<p>{Case photos oui} Autorise</p><p>{Case partenaires oui} Autorise</p>' });
    const m = await docCtrl.consentementsManquants(faux.promise(), 'o1', etat.doc);
    assert.deepStrictEqual(m.map((f) => f.cle), ['droit_image', 'partenaires']);
    reinitialiser({ corps: '<p>{Choix partenaires}</p><p>{Case photos oui}</p>' });
    assert.deepStrictEqual((await docCtrl.consentementsManquants(faux.promise(), 'o1', etat.doc)).map((f) => f.cle),
        ['partenaires', 'droit_image']);
});

// ── La signature ─────────────────────────────────────────────────────────────────────────────

test('le stagiaire ne signe pas un document qui imprime une réponse qu\'il n\'a pas donnée', async () => {
    reinitialiser();
    const r = await appeler(docCtrl.signDocument, { user: stagiaire, params: { id: 'd1' },
        body: { signer_name: 'Jean Dupont', signature_data: SIGNATURE } });
    assert.strictEqual(r.code, 422);
    assert.deepStrictEqual(r.corps.consentements, ['droit_image']);
    assert.match(r.corps.message, /Répondez d'abord à «\u00a0Diffuser des photos de moi prises pendant la formation\u00a0»\u00a0:/);
});

test('le personnel non plus : on lui dit où saisir une réponse papier', async () => {
    reinitialiser();
    const r = await appeler(docCtrl.signDocument, { user: bureau, params: { id: 'd1' },
        body: { signer_name: 'Secrétariat', signature_data: SIGNATURE } });
    assert.strictEqual(r.code, 422);
    assert.match(r.corps.message, /Le stagiaire n'a pas encore répondu/);
    assert.match(r.corps.message, /page de la session/);
});

test('une fois la réponse donnée, plus rien à demander', async () => {
    reinitialiser({ reponses: [{ finalite: 'droit_image', accorde: 0 }] });
    assert.deepStrictEqual(await docCtrl.consentementsManquants(faux.promise(), 'o1', etat.doc), []);
});

test('c\'est le MODÈLE qui décide, par ses jetons — jamais le type de document', async () => {
    /* CLAUDE.md § 2.2 : aucune restriction codée en dur par type. Un « Droit à l'image » sans
       jeton ne demande rien ; un contrat qui imprimerait la réponse « partenaires » la demanderait. */
    reinitialiser({ corps: '<p>Autorisation, sans case.</p>' });
    assert.deepStrictEqual(await docCtrl.consentementsManquants(faux.promise(), 'o1', etat.doc), []);
    reinitialiser({ corps: '<p>{Case partenaires oui} Autorise</p>',
        doc: { id: 'd2', type: 'CONTRAT', learner_id: 'l1', template_slug: 'contrat', status: 'ENVOYE' } });
    const m = await docCtrl.consentementsManquants(faux.promise(), 'o1', etat.doc);
    assert.deepStrictEqual(m.map((f) => f.cle), ['partenaires']);
    /* Et rien pour un document déjà signé : sa réponse est figée avec lui. */
    reinitialiser({ doc: { ...etat.doc, status: 'SIGNE' } });
    assert.deepStrictEqual(await docCtrl.consentementsManquants(faux.promise(), 'o1', etat.doc), []);
});

test('le lien de signature du représentant attend, lui aussi, la réponse du stagiaire', async () => {
    /* Une autorisation est personnelle : le représentant qui signe « à la place » du stagiaire ne
       répond pas pour lui. On le lui dit AVANT qu'il trace sa signature pour rien. */
    reinitialiser();
    const page = await appeler(getSignPage, { params: { token: 't1' } });
    assert.strictEqual(page.code, 200);
    assert.match(page.corps.data.bloque, /qu'il n'a pas encore donnée/);
    const envoi = await appeler(submitSign, { params: { token: 't1' }, body: { signer_name: 'M. Martin', signature_data: SIGNATURE } });
    assert.strictEqual(envoi.code, 422);
    assert.match(envoi.corps.message, /Il répond depuis son espace/);
    /* Un autre créneau (un intervenant) n'imprime pas la réponse du stagiaire : rien ne l'attend. */
    reinitialiser({ lien: { ...etat.lien, slot: 'externe' } });
    assert.strictEqual((await appeler(getSignPage, { params: { token: 't1' } })).corps.data.bloque, null);
});

test('la consultation pose les questions au stagiaire, et PRÉVIENT les autres', async () => {
    reinitialiser();
    const moi = await appeler(docCtrl.getDocument, { user: stagiaire, params: { id: 'd1' } });
    assert.strictEqual(moi.code, 200);
    assert.deepStrictEqual(moi.corps.data.questions_consentement.map((q) => q.cle), ['droit_image']);
    assert.strictEqual(moi.corps.data.questions_consentement[0].formulation, lib.FINALITES.droit_image.formulation,
        'la phrase montrée est celle que le registre figera');
    assert.strictEqual(moi.corps.data.peut_repondre, true);
    const lui = await appeler(docCtrl.getDocument, { user: bureau, params: { id: 'd1' } });
    assert.strictEqual(lui.corps.data.peut_repondre, false, 'le personnel ne répond pas à la place du stagiaire');
    assert.strictEqual(lui.corps.data.questions_consentement.length, 1, 'mais il voit ce qui manque');
});

// ── Le suivi par l'organisme ─────────────────────────────────────────────────────────────────

test('la page d\'une session suit aussi le droit à l\'image — et refuse une question inconnue', async () => {
    /* Une valeur inconnue est REFUSÉE, pas remplacée par les partenaires : l'écran croirait
       afficher les photos, et lirait les partenaires. */
    const lecture = await appeler(getSessionConsents, { user: bureau, params: { id: 's1' }, query: { finalite: 'bidon' } });
    assert.strictEqual(lecture.code, 422);
    const saisie = await appeler(setConsentPourStagiaire, { user: bureau, params: { id: 's1', learnerId: 'l1' },
        body: { accorde: true, source: 'papier', finalite: 'bidon' } });
    assert.strictEqual(saisie.code, 422);
    const ctrl = sansCommentaires(lire(path.join(API, 'controllers/consentement.controller.js')));
    assert.match(ctrl, /consentements\.etatParStagiaire\(\s*conn, req\.user\.organization_id, bloc\.inscrits\.map\(\(l\) => l\.id\), finalite\)/);
    assert.match(ctrl, /aReponduLuiMeme\(\s*conn, req\.user\.organization_id, req\.params\.learnerId, finalite\)/,
        'la parole du stagiaire ne s\'écrase pas depuis le bureau — pour les photos non plus');
    const ui = lire(path.join(UI, 'components/SessionConsentements.jsx'));
    assert.match(ui, /getSessionConsents\(sessionId, finalite\)/);
    assert.match(ui, /setSessionConsent\(sessionId, learnerId, accorde, source, finalite\)/);
    assert.match(lire(path.join(UI, 'pages/SessionDetail.jsx')), /<SessionConsentements sessionId=\{id\} canEdit=\{peutModifier\} finalite="droit_image" \/>/);
});

// ── Les écrans ───────────────────────────────────────────────────────────────────────────────

test('la fenêtre de l\'espace enchaîne les deux questions, chacune sous son compteur', () => {
    const src = sansCommentaires(lire(path.join(UI, 'components/ConsentModal.jsx')));
    /* Un compteur unique aurait fait taire la question des photos chez quiconque avait fermé trois
       fois celle des partenaires. */
    assert.match(src, /localStorage\.getItem\(CLE_RELANCES_DE\(cle\)\)/);
    /* Répondre à la première présente la seconde, au lieu de la renvoyer à la prochaine connexion. */
    assert.match(src, /const suivante = prochaine\(toutes, faites\);/);
    assert.match(src, /setADemander\(suivante\);/);
    /* L'encadré dit OÙ pour des photos, QUI pour des partenaires : c'est le serveur qui le sait. */
    assert.match(src, /aDemander\.titreDestinataires/);
});

test('le document pose sa question AVANT de proposer la signature', () => {
    const vue = sansCommentaires(lire(path.join(UI, 'components/DocumentViewModal.jsx')));
    assert.match(vue, /const showSign = canSign && doc && doc\.signable && doc\.status !== "SIGNE" && !questions\.length;/,
        'pas de bouton « Signer » tant qu\'une réponse imprimée manque');
    assert.match(vue, /doc\.peut_repondre \? \(\s*<QuestionsConsentement questions=\{questions\} onRepondu=\{recharger\} \/>/,
        'seul le stagiaire se voit poser la question ; les autres sont prévenus');
    const q = sansCommentaires(lire(path.join(UI, 'components/QuestionsConsentement.jsx')));
    /* LES DEUX RÉPONSES ONT LE MÊME POIDS : même classe, même largeur. */
    assert.strictEqual((q.match(/className="btn consent-choix"/g) || []).length, 2);
    assert.match(q, /setMyConsent\(q\.cle, accorde\)/);
    const pub = lire(path.join(UI, 'pages/SignerPublic.jsx'));
    assert.match(pub, /!data\.bloque && \(/, 'le lien public cache le bouton tant que la réponse manque');
});

test('la palette propose les jetons, hors documents d\'entreprise', () => {
    const tpl = sansCommentaires(lire(path.join(API, 'controllers/template.controller.js')));
    assert.match(tpl, /groups\.push\(catalogGroup\('Autorisations'\)\);/);
    /* Un document d'entreprise n'a pas de stagiaire unique dont imprimer la réponse. */
    assert.match(tpl, /const HIDDEN_FOR_COMPANY = new Set\(\[[^\]]*'Autorisations'/);
});

// ── Les mots de l'écran ──────────────────────────────────────────────────────────────────────

test('le chemin « Mon profil → … » mène à un onglet qui existe', () => {
    /* LE DÉFAUT (2026-09-22) : la fenêtre de consentement envoyait vers « Mon profil →
       Confidentialité », et l'onglet s'appelait « Visibilité ». L'école a choisi de renommer
       l'onglet. Ce test lit les onglets du profil et chaque chemin annoncé aux stagiaires. */
    const profil = lire(path.join(UI, 'components/ProfileModal.jsx'));
    const onglets = [...profil.matchAll(/onClick=\{\(\) => setTab\("[a-z]+"\)\}>([^<]+)<\/button>/g)].map((m) => m[1]);
    assert.ok(onglets.includes('Confidentialité'), `onglets trouvés : ${onglets.join(', ')}`);
    for (const f of ['components/ConsentModal.jsx', 'components/QuestionsConsentement.jsx', 'pages/Confidentialite.jsx']) {
        const chemins = [...lire(path.join(UI, f)).matchAll(/Mon profil → ([A-ZÉa-zéèêàç ]+?)(?=<|[.,])/g)].map((m) => m[1].trim());
        assert.ok(chemins.length, `${f} doit dire où changer sa réponse`);
        for (const c of chemins) assert.ok(onglets.includes(c), `${f} envoie vers « ${c} », qui n'est pas un onglet du profil`);
    }
    /* Et la section ne répète pas le nom de l'onglet qui la contient. */
    assert.match(profil, /<div className="consent-bloc-t">Mes autorisations<\/div>/);
});

test('aucune ponctuation haute ne peut commencer une ligne', () => {
    /* Relevé sur téléphone : « …ses formations » en bout de ligne, et la suivante commençait par
       « : sur son site internet ». Devant « : ; » et à l'intérieur des guillemets, l'espace est
       insécable ; une espace ordinaire à ces endroits laisse le navigateur couper la ligne. */
    const ordinaire = / [:;»]|« /;
    const textes = {
        'la question': lib.FINALITES.droit_image.formulation,
        'les supports': lib.FINALITES.droit_image.destinataires,
        'le refus de signer': docCtrl.questionsEnClair([lib.FINALITES.droit_image, lib.FINALITES.partenaires]),
        ...Object.fromEntries(TOKEN_CATALOG.find((g) => g.group === 'Autorisations').tokens.map((t) => [`le jeton ${t.key}`, t.label])),
    };
    for (const [quoi, texte] of Object.entries(textes)) {
        assert.doesNotMatch(texte, ordinaire, `${quoi} : « ${texte} »`);
    }
    assert.match(lib.FINALITES.droit_image.formulation, /formations\u00a0: sur son site internet/);
    /* Le document proposé, une fois ses balises retirées : ses deux-points et ses points-virgules
       suivent une espace insécable (&nbsp;), comme la note qui l'annonce dans l'éditeur. */
    const { MODELES_PROPOSES } = require('../lib/modelesProposes.js');
    const texteDuModele = MODELES_PROPOSES['droit-image'].body.replace(/<[^>]+>/g, '');
    assert.doesNotMatch(texteDuModele, / [:;]/, 'le document proposé');
    assert.doesNotMatch(MODELES_PROPOSES['droit-image'].note, ordinaire, 'la note de l\'éditeur');
    const q = lire(path.join(UI, 'components/QuestionsConsentement.jsx'));
    assert.match(q, /<b>Avant de signer&nbsp;:<\/b>/);
    const vue = lire(path.join(UI, 'components/DocumentViewModal.jsx'));
    assert.match(vue, /`«\\u00a0\$\{q\.titre\}\\u00a0»`/, 'les titres cités par la ligne d\'attente');
});
