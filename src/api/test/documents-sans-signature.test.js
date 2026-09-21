/**
 * UN DOCUMENT SANS SIGNATAIRE N'EST PAS « NON SIGNÉ ».
 *
 * LE DÉFAUT, constaté le 2026-09-17 sur la fiche d'un stagiaire RS7404 : « 9 signés sur 12 »,
 * pour un dossier où il ne manquait rien. Les trois documents manquants — règlement d'examen,
 * livret d'accueil, CGV — n'ont AUCUN signataire dans leur modèle : ils se remettent, ils ne se
 * signent pas. Mais la fiche rangeait au seul STATUT, et un document envoyé non « Signé » tombait
 * « chez le stagiaire, en attente de signature », où rien ne pouvait jamais l'en faire sortir.
 *
 * LE MÊME DÉFAUT CÔTÉ STAGIAIRE, dans le parcours d'une formation : tout document non signé y
 * portait « À signer » et restait « à faire » à vie — alors qu'aucun bouton ne permet de signer
 * un livret d'accueil. « Mes documents », lui, avait déjà la bonne règle ; l'autre écran ne
 * recevait simplement pas les drapeaux.
 *
 * Les modèles ci-dessous reprennent les signataires RELEVÉS en production ce jour-là.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { mergeSteps, signatureAttendue } = require('../lib/documents.js');

/* Lignes `document_template` telles qu'en production (colonnes utiles seulement). Le reste des
   étapes vient des défauts du code, comme en vrai : certificat, émargements, contrat… */
const LIGNES_MODELES = [
    { slug: 'r-glement-examen', label: 'Règlement examen', doc_type: null, signers: '[]' },
    { slug: 'livret-accueil', label: "Livret d'accueil", doc_type: 'LIVRET_ACCUEIL', signers: '[]' },
    { slug: 'cgv', label: 'Conditions générales de vente (CGV)', doc_type: 'CGV', signers: '[]' },
    { slug: 'convocation', label: "Convocation à l'examen", doc_type: 'CONVOCATION', signers: '["ORG"]' },
    { slug: 'droit-image', label: "Droit à l'image", doc_type: 'DROIT_IMAGE', signers: '["STAGIAIRE"]' },
    { slug: 'convention', label: 'Convention de formation', doc_type: 'CONVENTION', signers: '["ORG","STAGIAIRE","ENTREPRISE"]' },
    { slug: 'devis-professionnel-copie', label: 'Devis professionnel entreprise', doc_type: 'DEVIS', signers: '["ORG","ENTREPRISE"]' },
    { slug: 'contrat-hygiene', label: 'Contrat Hygiène', doc_type: 'CONTRAT', signers: '["EXTERNAL","ORG"]' },
];
const ETAPES = mergeSteps(LIGNES_MODELES);

test('personne à attendre : ni les documents sans signataire, ni ceux que seule l\'école signe', () => {
    for (const doc of [
        { template_slug: 'r-glement-examen', type: 'R_GLEMENT_EXAMEN' },
        { template_slug: 'livret-accueil', type: 'LIVRET_ACCUEIL' },
        { template_slug: 'cgv', type: 'CGV' },
        /* L'école signe À L'ENVOI : une convocation partie est complète. */
        { template_slug: 'convocation', type: 'CONVOCATION' },
        /* Défaut du code, sans ligne en base : anciens drapeaux « signable » sans stagiaire. */
        { template_slug: 'certificat-realisation', type: 'CERTIFICAT_REALISATION' },
    ]) {
        assert.strictEqual(signatureAttendue(ETAPES, doc), false, `${doc.template_slug} n'attend aucune signature`);
    }
});

test('une signature à recevoir : stagiaire, entreprise ou signataire externe', () => {
    for (const doc of [
        { template_slug: 'droit-image', type: 'DROIT_IMAGE' },
        { template_slug: 'convention', type: 'CONVENTION' },
        { template_slug: 'devis-professionnel-copie', type: 'DEVIS' },
        { template_slug: 'contrat-hygiene', type: 'CONTRAT' },
        /* Défaut du code, anciens drapeaux : le contrat se signe par le stagiaire. */
        { template_slug: 'contrat', type: 'CONTRAT' },
    ]) {
        assert.strictEqual(signatureAttendue(ETAPES, doc), true, `${doc.template_slug} attend une signature`);
    }
});

test('le QCM attend sa réponse, l\'émargement son stagiaire — quels que soient leurs modèles', () => {
    assert.strictEqual(signatureAttendue(ETAPES, { quiz_id: 'q1', type: 'QCM_JOUR_1' }), true);
    /* Les modèles d'émargement par défaut n'ont aucun signataire déclaré : sans l'exception, la
       feuille passerait pour terminée dès l'envoi. */
    assert.strictEqual(signatureAttendue(ETAPES, { template_slug: 'emargement-5j', type: 'EMARGEMENT' }), true);
});

test('un document dont on ne retrouve pas le modèle n\'attend personne', () => {
    /* Même lecture que l'espace stagiaire, qui ne propose alors aucun bouton de signature :
       l'annoncer « en attente » promettrait une signature que personne ne peut donner. */
    assert.strictEqual(signatureAttendue(ETAPES, { template_slug: 'supprime', type: 'INCONNU' }), false);
    assert.strictEqual(signatureAttendue(ETAPES, null), false);
});

/* ─────────────── Les deux routes, exécutées contre une fausse base ─────────────── */

const cheminDb = require.resolve('../config/database.js');
let reponses = [];
const faux = {
    promise: () => ({
        query: async (sql) => {
            const r = reponses.find(([motif]) => motif.test(sql));
            return r ? r[1] : [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { listDocuments } = require('../controllers/document.controller.js');
const { getMyFormation } = require('../controllers/espace.controller.js');

const appeler = async (fn, req) => {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; }, setHeader() {} };
    await fn(req, res);
    return { code, corps };
};

test('fiche stagiaire : chaque document dit si une signature est attendue', async () => {
    reponses = [
        [/information_schema/i, [[]]],
        [/FROM document_template/, [LIGNES_MODELES]],
        [/FROM generated_document d\b/, [[
            { id: 'd1', type: 'R_GLEMENT_EXAMEN', template_slug: 'r-glement-examen', quiz_id: null, title: 'R_GLEMENT_EXAMEN', status: 'ENVOYE' },
            { id: 'd2', type: 'CGV', template_slug: 'cgv', quiz_id: null, title: 'Conditions générales de vente', status: 'ENVOYE' },
            { id: 'd3', type: 'DROIT_IMAGE', template_slug: 'droit-image', quiz_id: null, title: "Droit à l'image", status: 'ENVOYE' },
            { id: 'd4', type: 'QCM_JOUR_1', template_slug: null, quiz_id: 'q1', title: 'QCM', status: 'ENVOYE' },
        ]]],
    ];
    const { code, corps } = await appeler(listDocuments, { query: { learner_id: 'l1' }, user: { organization_id: 'o1', id: 'u1' } });
    assert.strictEqual(code, 200, JSON.stringify(corps));
    const parId = Object.fromEntries(corps.data.documents.map((d) => [d.id, d.signature_attendue]));
    assert.deepStrictEqual(parId, { d1: false, d2: false, d3: true, d4: true });
});

test('la requête de la fiche lit le modèle et le QCM de chaque document', () => {
    /* La fausse base rend les colonnes qu'on lui donne : sans cette lecture du SQL, retirer
       `template_slug` de la requête passerait inaperçu — et la règle retomberait sur le seul
       type, où quatre modèles de devis aux signataires différents se confondent. */
    const src = fs.readFileSync(path.join(__dirname, '../controllers/document.controller.js'), 'utf8');
    const liste = src.slice(src.indexOf('const listDocuments'), src.indexOf('async function prepareLearnerDoc'));
    assert.match(liste, /SELECT d\.id, d\.type, d\.template_slug, d\.quiz_id,/);
    assert.match(liste, /d\.signature_attendue = signatureAttendue\(orgSteps, d\)/);
});

test('parcours du stagiaire : les documents portent enfin les drapeaux de « Mes documents »', async () => {
    reponses = [
        [/FROM learner WHERE user_id/, [[{ id: 'l1', organization_id: 'o1', user_id: 'u1', opco: null }]]],
        [/WHERE e\.id = \? AND e\.learner_id = \?/, [[{
            enrollment_id: 'e1', financing: 'PERSO', session_id: null, program_id: 'p1',
            start_date: '2026-09-14', end_date: '2026-09-18', year: 2026, week: 38,
            program_code: 'RS7404', program_title: 'RS7404', program_hours: 35, program_days: 5,
            program_hygiene: 0, program_rs: 'RS7404',
        }]]],
        [/FROM document_template/, [LIGNES_MODELES]],
        [/gd\.status IN \('ENVOYE','CONSULTE','SIGNE'\)[\s\S]*ORDER BY gd\.created_at/, [[
            { id: 'd1', type: 'LIVRET_ACCUEIL', template_slug: 'livret-accueil', title: "Livret d'accueil", status: 'ENVOYE', quiz_id: null, doc_company_id: null },
            { id: 'd2', type: 'DROIT_IMAGE', template_slug: 'droit-image', title: "Droit à l'image", status: 'ENVOYE', quiz_id: null, doc_company_id: null },
            { id: 'd3', type: 'CONVENTION', template_slug: 'convention', title: 'Convention', status: 'ENVOYE', quiz_id: null, doc_company_id: 'c1' },
        ]]],
    ];
    const { code, corps } = await appeler(getMyFormation, { params: { id: 'e1' }, user: { id: 'u1', organization_id: 'o1' } });
    assert.strictEqual(code, 200, JSON.stringify(corps));
    const docs = Object.fromEntries(corps.data.documents.map((d) => [d.id, d]));
    assert.deepStrictEqual([docs.d1.signable, docs.d1.company_sign], [false, false], 'le livret se consulte');
    assert.deepStrictEqual([docs.d2.signable, docs.d2.company_sign], [true, false], 'le droit à l\'image se signe');
    assert.deepStrictEqual([docs.d3.signable, docs.d3.company_sign], [false, true], 'la convention d\'un dossier entreprise est signée par le représentant');
    assert.ok(!('doc_company_id' in docs.d1), 'donnée de calcul, elle ne sort pas');
});

test('le parcours relit le modèle et l\'entreprise de chaque document', () => {
    const src = fs.readFileSync(path.join(__dirname, '../controllers/espace.controller.js'), 'utf8');
    const route = src.slice(src.indexOf('const getMyFormation'));
    assert.match(route, /SELECT gd\.id, gd\.type, gd\.template_slug,/);
    assert.match(route, /MAX\(e2\.company_id\)[\s\S]*AS doc_company_id/);
    assert.match(route, /marquerSignataires\(steps, documents\)/);
});

/* ─────────────── Les écrans ─────────────── */

// Les douze documents du dossier constaté, avec le drapeau que le serveur leur donne désormais.
const DOSSIER = [
    ['R_GLEMENT_EXAMEN', 'ENVOYE', false], ['LIVRET_ACCUEIL', 'ENVOYE', false], ['CGV', 'ENVOYE', false],
    ['QCM 1', 'SIGNE', true], ['QCM 2', 'SIGNE', true], ['QCM 3', 'SIGNE', true], ['QCM 4', 'SIGNE', true],
    ['Convocation', 'SIGNE', false], ["Droit à l'image", 'SIGNE', true], ['Invitation', 'SIGNE', false],
    ['Devis', 'SIGNE', true], ['Contrat', 'SIGNE', true],
].map(([title, status, attendue], i) => ({ id: `d${i}`, title, status, signature_attendue: attendue }));

test('la fiche du dossier constaté : douze terminés sur douze', async () => {
    const { repartirDocuments } = await import('../../app/ui/lib/documentsDossier.js');
    const m = repartirDocuments(DOSSIER);
    assert.deepStrictEqual([m.faire.length, m.attente.length, m.fait.length], [0, 0, 12]);
});

test('ce qui attend vraiment reste en attente, ce qui n\'est pas parti reste à envoyer', async () => {
    const { groupeDuDocument } = await import('../../app/ui/lib/documentsDossier.js');
    assert.strictEqual(groupeDuDocument({ status: 'ENVOYE', signature_attendue: true }), 'attente');
    /* Sans signature, mais pas encore envoyé : il reste un geste à faire, et c'est l'envoi. */
    assert.strictEqual(groupeDuDocument({ status: 'A_FAIRE', signature_attendue: false }), 'faire');
    /* Drapeau absent (réponse d'avant la mise en ligne) : l'ancien rangement, jamais « terminé ». */
    assert.strictEqual(groupeDuDocument({ status: 'ENVOYE' }), 'attente');
    assert.strictEqual(groupeDuDocument({ status: 'INCONNU' }), 'faire');
});

test('le stagiaire : à faire ce qu\'il doit signer, en attente ce que signe son entreprise', async () => {
    const { etatPourLeStagiaire } = await import('../../app/ui/lib/documentsDossier.js');
    assert.strictEqual(etatPourLeStagiaire({ status: 'ENVOYE', signable: false, company_sign: false }), 'done', 'livret reçu');
    assert.strictEqual(etatPourLeStagiaire({ status: 'ENVOYE', signable: true, company_sign: false }), 'todo', 'à signer');
    assert.strictEqual(etatPourLeStagiaire({ status: 'ENVOYE', signable: false, company_sign: true }), 'wait', 'chez l\'entreprise');
    assert.strictEqual(etatPourLeStagiaire({ status: 'ENVOYE', signable: false, quiz_id: 'q1' }), 'todo', 'QCM à remplir');
    assert.strictEqual(etatPourLeStagiaire({ status: 'SIGNE', signable: true }), 'done');
    assert.strictEqual(etatPourLeStagiaire({ status: 'ENVOYE' }), 'todo', 'drapeau absent : jamais « terminé »');
});

test('les deux pages rangent par la règle partagée, plus par le seul statut', () => {
    const lire = (f) => fs.readFileSync(path.join(__dirname, '../../app/ui/pages', f), 'utf8');
    const fiche = lire('StagiaireDetail.jsx');
    assert.match(fiche, /import \{[^}]*\brepartirDocuments\b[^}]*\} from "\.\.\/lib\/documentsDossier\.js"/);
    assert.doesNotMatch(fiche, /const GROUPES_DOC/, 'une copie locale du rangement reviendrait au seul statut');
    /* LA JAUGE « TERMINÉS SUR N » A QUITTÉ LA FICHE le 2026-09-21 : les documents des étapes ont
       leurs gestes sur leur carte du parcours, et la liste ne garde que ceux qu'aucune étape ne
       montre. Une jauge sur cette liste PARTIELLE compterait faux ; l'avancement se lit dans le
       parcours, où un document sans signature compte comme fait dès l'envoi (lib/parcours.js,
       etatEtape) — la règle même que cette jauge avait dû apprendre. */
    assert.doesNotMatch(fiche, /docs-jauge/, 'plus de seconde jauge, sur une liste partielle');
    assert.match(fiche, /repartirDocuments\(autres\)/, 'le rangement par qui doit agir vaut pour ce qui reste listé');
    assert.doesNotMatch(fiche, /signé\{signes > 1/, 'aucun compte de « signés »');

    const parcours = lire('StudentFormationDetail.jsx');
    assert.match(parcours, /etat: etatPourLeStagiaire\(d\)/);
    assert.doesNotMatch(parcours, /etat: d\.status === "SIGNE" \? "done" : "todo"/);
});
