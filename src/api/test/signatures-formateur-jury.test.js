/**
 * FORMATEUR ET JURY SIGNENT EN LIGNE LES DOCUMENTS DE LA SESSION.
 *
 * DEMANDÉ LE 2026-09-21 : « le formateur et le jury, même chose » — après l'entreprise,
 * l'organisme et l'intervenant. Les blocs « Formateur », « Jury 1 », « Jury 2 », « Président du
 * jury » existaient dans la palette, mais RIEN ne les remplissait : ils restaient vides sur tous
 * les documents. Choix de l'organisme : les DOCUMENTS DE SESSION, sur le modèle de l'intervenant.
 *
 *   · à l'envoi, chaque cadre du modèle s'attribue à une personne AFFECTÉE à la session —
 *     formateur (session_trainer) ou intervenant, dont le jury (session_intervenant) ;
 *   · chacun signe depuis son espace : le jury dans l'espace intervenant, le formateur sur la
 *     page de la session ;
 *   · LE DOCUMENT N'EST « SIGNÉ » QUE LORSQUE TOUS SES CADRES LE SONT. Jusqu'ici, la première
 *     signature le passait à SIGNÉ et faisait contresigner l'organisme : deux cadres encore vides
 *     sur un document dit signé, et l'organisme signant avant les autres au lieu d'en dernier.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : un routeur de requêtes, réglé par test ───────────────────────────────────────
let routes = [];
let journal = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            journal.push({ sql, params });
            const r = routes.find(([motif]) => motif.test(sql));
            return r ? (typeof r[1] === 'function' ? r[1](sql, params) : r[1]) : [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { casesDuModele, envoyerDocumentSession, mesCasesDeSession } = require('../controllers/documentSession.controller.js');
const { applySlotSignature } = require('../controllers/document.controller.js');
const { signerMonDocument } = require('../controllers/intervenant.controller.js');
const { sectionFor } = require('../middlewares/sectionAccess.middleware.js');

const puce = (cle, libelle) => `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${libelle}">${libelle}</span>`;
const CORPS = `<p>${puce('sig:formateur', 'Formateur')}</p><p>${puce('sig:jury1', 'Jury 1')}</p>`
    + `<p>${puce('sig:presidentdujury', 'Président du jury')}</p><p>${puce('sig:stagiaire1', 'Stagiaire 1')}</p>`
    + `<p>${puce('sig:representant', 'Cachet de l\'entreprise')}</p><p>${puce('sig:jury1', 'Jury 1')}</p>`;
const MODELE = [/FROM document_template WHERE organization_id = \? AND slug = \?/,
    [[{ kind: 'builder', body_html: CORPS, header_html: '', footer_html: '', layout: null }]]];

async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'moi', role: 'SUPER_ADMIN' }, params: {}, body: {}, headers: {}, ip: '127.0.0.1', ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}

test('LES CADRES À ATTRIBUER : ceux du modèle, avec leur libellé, sans le stagiaire ni l\'entreprise', async () => {
    routes = [MODELE];
    assert.deepStrictEqual(await casesDuModele('o1', 'pv-seance'), [
        { slot: 'formateur', label: 'Formateur' },
        { slot: 'jury1', label: 'Jury 1' },
        { slot: 'presidentdujury', label: 'Président du jury' },
    ], 'le stagiaire signe lui-même, l\'entreprise depuis son espace ; un cadre répété ne compte qu\'une fois');
});

// Une session : une formatrice, deux membres du jury ; un modèle « Externe » avec ses cadres.
const SESSION = [
    [/FROM training_session WHERE id = \? AND organization_id = \?/, [[{ id: 's1' }]]],
    [/FROM session_trainer st JOIN user u/, [[{ id: 'f1', nom: 'Claire FORMATRICE' }]]],
    [/FROM session_intervenant si JOIN user u/, [[{ id: 'j1', nom: 'Paul JURY', specialty: 'Jury' }, { id: 'j2', nom: 'Anne PRÉSIDENTE', specialty: 'Présidente du jury' }]]],
    [/FROM document_template WHERE organization_id = \?(?! AND slug)/, [[{ slug: 'pv-seance', label: 'PV de séance', doc_type: 'PV', active: 1, signers: '["EXTERNAL","ORG"]' }]]],
    MODELE,
];
const casesCreees = () => journal.filter((q) => /INSERT INTO document_signature/.test(q.sql)).map((q) => q.params.slice(3));

test('ENVOYER : chaque cadre à sa personne — formateur ou jury — et une case vide par cadre', async () => {
    routes = [...SESSION]; journal = [];
    const { code, corps } = await appeler(envoyerDocumentSession, { params: { id: 's1' }, body: { template_slug: 'pv-seance', attributions: [
        { slot: 'formateur', user_id: 'f1' }, { slot: 'jury1', user_id: 'j1' }, { slot: 'presidentdujury', user_id: 'j2' },
    ] } });
    assert.strictEqual(code, 201, JSON.stringify(corps));
    assert.deepStrictEqual(casesCreees(), [
        ['formateur', 'Formateur', 'f1'], ['jury1', 'Jury 1', 'j1'], ['presidentdujury', 'Président du jury', 'j2'],
    ], 'le libellé du cadre suit la case : c\'est sous ce nom que la personne signera');
    assert.match(corps.message, /Claire FORMATRICE/);
});

test('ENVOYER : ce qui ne tient pas est refusé, AVANT de créer quoi que ce soit', async () => {
    const refus = async (attributions) => {
        routes = [...SESSION]; journal = [];
        const r = await appeler(envoyerDocumentSession, { params: { id: 's1' }, body: { template_slug: 'pv-seance', attributions } });
        assert.strictEqual(casesCreees().length, 0);
        assert.ok(!journal.some((q) => /INSERT INTO generated_document/.test(q.sql)), 'aucun document à moitié envoyé');
        return r;
    };
    assert.strictEqual((await refus([{ slot: 'formateur', user_id: 'inconnu' }])).code, 422, 'personne hors de la session');
    assert.strictEqual((await refus([{ slot: 'stagiaire1', user_id: 'f1' }])).code, 422, 'le cadre du stagiaire ne s\'attribue pas');
    assert.strictEqual((await refus([{ slot: 'jury9', user_id: 'j1' }])).code, 422, 'cadre absent du modèle');
    assert.strictEqual((await refus([{ slot: 'jury1', user_id: 'j1' }, { slot: 'jury1', user_id: 'j2' }])).code, 422, 'un cadre, une personne');
});

test('SIGNÉ QUAND TOUT EST SIGNÉ : la première signature ne clôt plus le document', async () => {
    const DOC = { id: 'd1', template_slug: 'sans-rendu', learner_id: null };
    const signerAvecReste = async (reste) => {
        routes = [[/COUNT\(\*\) AS n FROM document_signature WHERE document_id = \? AND signed_at IS NULL/, [[{ n: reste }]]]];
        journal = [];
        await applySlotSignature(faux.promise(), 'o1', DOC, { slot: 'jury1', label: 'Jury 1', signerName: 'Paul JURY', signatureData: 'data:image/png;base64,AA==' });
        return journal.some((q) => /SET status = 'SIGNE'/.test(q.sql));
    };
    assert.strictEqual(await signerAvecReste(2), false, 'deux cadres encore vides : le document reste envoyé');
    assert.strictEqual(await signerAvecReste(0), true, 'le dernier cadre signé clôt le document');
});

test('L\'ORGANISME CONTRESIGNE EN DERNIER — après TOUS les cadres', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
    const zone = src.slice(src.indexOf('async function applySlotSignature'), src.indexOf('async function applySlotSignature') + 4000);
    assert.match(zone, /const orgSigne = complet && orgSignsDoc\(orgSteps, doc\);\s+if \(orgSigne\) await applyOrgVisibleSignature/);
    assert.match(zone, /if \(orgSigne\) \{\s+const org = ctx\.org/, 'le sceau cryptographique de l\'organisme aussi');
});

test('SIGNER : tous MES cadres vides d\'un coup, chacun sous son libellé', async () => {
    routes = [
        [/FROM document_signature ds JOIN generated_document d ON d\.id = ds\.document_id\s+WHERE ds\.document_id = \? AND ds\.user_id = \?/,
            [[{ id: 'c1', slot: 'jury1', label: 'Jury 1', signed_at: null, doc_id: 'd1' },
              { id: 'c2', slot: 'presidentdujury', label: 'Président du jury', signed_at: null, doc_id: 'd1' },
              { id: 'c3', slot: 'formateur', label: 'Formateur', signed_at: '2026-09-21', doc_id: 'd1' }]]],
        [/SELECT \* FROM generated_document WHERE id = \? AND organization_id = \?/, [[{ id: 'd1', template_slug: 'sans-rendu', learner_id: null }]]],
        [/SELECT first_name, last_name FROM user WHERE id = \?/, [[{ first_name: 'Anne', last_name: 'PRÉSIDENTE' }]]],
        [/SELECT id FROM document_signature WHERE document_id = \? AND slot = \?/, [[{ id: 'x' }]]],
    ];
    journal = [];
    const { code } = await appeler(signerMonDocument, { params: { id: 'd1' }, body: { signature_data: 'data:image/png;base64,AA==' } });
    assert.strictEqual(code, 200);
    const signes = journal.filter((q) => /UPDATE document_signature SET label = \?/.test(q.sql)).map((q) => q.params[0]);
    assert.deepStrictEqual(signes, ['Jury 1', 'Président du jury'], 'les deux cadres vides, pas celui déjà signé — et jamais « Intervenant externe »');
});

test('MES CADRES DE LA SESSION : ce qu\'un formateur voit sur la page de la session', async () => {
    routes = [[/FROM document_signature ds JOIN generated_document d ON d\.id = ds\.document_id\s+WHERE ds\.user_id = \?/,
        [[{ id: 'd1', title: 'PV de séance', status: 'ENVOYE', slot: 'formateur', label: 'Formateur', signe_le: null },
          { id: 'd2', title: 'Contrat', status: 'SIGNE', slot: 'formateur', label: 'Formateur', signe_le: '2026-09-20 10:00' }]]]];
    const { corps } = await appeler(mesCasesDeSession, { params: { id: 's1' } });
    assert.deepStrictEqual(corps.data.map((d) => [d.id, d.a_signer]), [['d1', true], ['d2', false]]);
});

test('LES PORTES : le formateur signe par un acte de PARTICIPANT, la lecture reste au personnel', () => {
    const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.match(lire('routes/document.routes.js'), /router\.post\('\/:id\/mes-cases\/sign', authenticateToken, signerMonDocument\);/);
    assert.match(lire('routes/session.routes.js'), /router\.get\('\/:id\/mes-cases', authorizeRoles\(\.\.\.STAFF_ROLES\), mesCasesDeSession\);/);
    /* Un formateur en LECTURE sur Stagiaires signe quand même SA case : signer n'est pas écrire
       dans la rubrique (même exception que /documents/:id/sign). */
    assert.strictEqual(sectionFor('documents', 'd1/mes-cases/sign'), null);
    assert.strictEqual(sectionFor('documents', 'd1/sign-link'), '/stagiaires', 'le lien de signature reste un acte de bureau');
});

test('LES ÉCRANS : attribution par cadre, état par cadre, « À signer par vous »', () => {
    const ui = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
    const carte = ui('components/DocumentsExternes.jsx');
    assert.match(carte, /\{ template_slug: modele, attributions \}/, 'l\'envoi porte une attribution par cadre');
    assert.match(carte, /aria-label=\{`Qui signe « \$\{c\.label\} » \?`\}/);
    assert.match(carte, /<optgroup label="Formateurs">/);
    assert.match(carte, /await signerMesCases\(d\.id, signature_data \? \{ signature_data \} : \{\}\)/);
    assert.match(carte, /\{c\.label\} : \{c\.signataire \|\| "—"\}/, 'chaque cadre, sa personne et son état');
    assert.match(ui('pages/IntervenantEspace.jsx'), /\{d\.cadres \? ` · \$\{d\.cadres\}` : ""\}/, 'le jury voit QUEL cadre on lui demande');
});
