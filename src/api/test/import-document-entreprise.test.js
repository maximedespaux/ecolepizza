/**
 * IMPORTER L'EXEMPLAIRE SIGNÉ RENVOYÉ PAR UNE ENTREPRISE — demandé le 2026-09-28 : « pour les
 * entreprises comme Cuisine de Julien, il n'y a que Préparer le document, alors que le stagiaire
 * peut importer un document ».
 *
 * LE DÉFAUT. La fiche entreprise ne passait pas `onImport` au parcours : une convention signée
 * revenue par e-mail ne pouvait se rattacher nulle part, et l'étape de groupe restait « à signer »
 * pendant que le classeur, lui, était complet. La fiche stagiaire le permettait depuis la 145.
 *
 * TROIS PIÈGES, chacun tenu ici :
 *   · UN DOCUMENT PAR OPCO. Une étape de groupe peut en montrer plusieurs ; rien ne dit à quel OPCO
 *     appartient le fichier reçu. Deviner rattacherait la convention d'AKTO à OCAPIAT : chacun
 *     s'importe sur SA ligne ;
 *   · L'ÉTAPE JAMAIS PRÉPARÉE. Elle l'est d'abord par le MÊME chemin que « Préparer le document » ;
 *     le fichier est donc vérifié AVANT — refusé après, il laisserait un document préparé que
 *     personne n'a demandé ;
 *   · « TÉLÉCHARGER » rendait toujours le PDF recomposé depuis le modèle, qui ne porte pas la
 *     signature de l'entreprise : pour un document importé, c'est le fichier reçu qui fait foi.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : colonnes présentes, requêtes capturées ─────────────────────────────────────
let colonnes = new Set();
let requetes = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            if (/information_schema\.columns/.test(sql)) return [colonnes.has(`${params[0]}.${params[1]}`) ? [{ 1: 1 }] : []];
            if (/FROM generated_document d/.test(sql)) return [[{ id: 'd1', template_slug: 'convention', status: 'SIGNE' }]];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { listCompanyDocuments } = require('../controllers/company.controller.js');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');
const ENTREPRISE = lire('pages/EntrepriseDetail.jsx');
const PARCOURS = lire('components/EnrollmentParcours.jsx');
const DOC_CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
/* Le corps d'une fonction du composant, jusqu'à la suivante. */
const fonction = (src, debut) => { const i = src.indexOf(debut); assert.ok(i >= 0, `${debut} introuvable`); return src.slice(i, src.indexOf('\n  }\n', i) + 4); };

test('OÙ RATTACHER LE FICHIER : aucun document → préparer ; un → lui ; plusieurs → refus', async () => {
    const { cibleImportGroupe, signeDansLApplication } = await import('../../app/ui/lib/documentsDossier.js');
    assert.deepStrictEqual(cibleImportGroupe([]), { preparer: true }, 'étape jamais préparée');
    assert.deepStrictEqual(cibleImportGroupe(undefined), { preparer: true });
    const envoye = { id: 'a', status: 'ENVOYE' };
    assert.deepStrictEqual(cibleImportGroupe([envoye]), { doc: envoye });
    // Un document par OPCO : rien ne dit lequel le fichier signe.
    assert.deepStrictEqual(cibleImportGroupe([envoye, { id: 'b', status: 'A_FAIRE' }]), { refus: 'plusieurs', n: 2 });

    // Signé DANS L'APPLICATION : rien à recevoir. Signé PAR IMPORT : on peut remplacer le fichier.
    const signeIci = { id: 'c', status: 'SIGNE', importe_le: null };
    const importe = { id: 'd', status: 'SIGNE', importe_le: '2026-09-28 10:00' };
    assert.deepStrictEqual(cibleImportGroupe([signeIci]), { refus: 'signe', doc: signeIci });
    assert.deepStrictEqual(cibleImportGroupe([importe]), { doc: importe });
    assert.strictEqual(signeDansLApplication(signeIci), true);
    assert.strictEqual(signeDansLApplication(importe), false);
    assert.strictEqual(signeDansLApplication(envoye), false);
    assert.strictEqual(signeDansLApplication(null), false);
});

test('LE FICHIER EST VÉRIFIÉ COMME LE SERVEUR LE VÉRIFIERA — mêmes types, même poids', async () => {
    const { refusDocumentRecu, TYPES_DOCUMENT, MAX_DOCUMENT_OCTETS } = await import('../../app/ui/lib/formatsDepot.js');
    /* LES DEUX LISTES NE DOIVENT PAS DIVERGER : une liste plus large préparerait le document puis
       échouerait à l'import — exactement ce que la vérification préalable doit empêcher. */
    const bloc = DOC_CTRL.slice(DOC_CTRL.indexOf('const MIMES_IMPORT = {'), DOC_CTRL.indexOf('};', DOC_CTRL.indexOf('const MIMES_IMPORT = {')));
    const serveur = [...bloc.matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1]).sort();
    assert.deepStrictEqual([...TYPES_DOCUMENT].sort(), serveur);
    assert.match(DOC_CTRL, /const MAX_IMPORT_OCTETS = 20 \* 1024 \* 1024;/);
    assert.strictEqual(MAX_DOCUMENT_OCTETS, 20 * 1024 * 1024);

    const fichier = (type, size = 1000) => ({ type, size });
    assert.strictEqual(refusDocumentRecu(fichier('application/pdf')), null);
    assert.strictEqual(refusDocumentRecu(fichier('application/vnd.openxmlformats-officedocument.wordprocessingml.document')), null);
    assert.match(refusDocumentRecu(fichier('text/html')), /^Format refusé/, 'le serveur le refuserait en 415');
    assert.match(refusDocumentRecu(fichier('')), /^Format refusé/, 'sans type déclaré, le navigateur envoie application/octet-stream');
    assert.match(refusDocumentRecu(fichier('application/pdf', 21 * 1024 * 1024)), /trop lourd \(20 Mo/);
    // Une photo est RÉDUITE avant l'envoi : son poids d'origine ne dit rien de ce qui partira.
    assert.strictEqual(refusDocumentRecu(fichier('image/jpeg', 30 * 1024 * 1024)), null);
    assert.ok(refusDocumentRecu(null));
});

test('LA LISTE DES DOCUMENTS DE GROUPE dit lesquels ont été reçus — avant comme après la 145', async () => {
    colonnes = new Set(['document_fichier.document_id']); requetes = [];
    let corps = null;
    const res = { status() { return this; }, json(b) { corps = b; return this; } };
    await listCompanyDocuments({ user: { organization_id: 'o1' }, params: { id: 'c1' }, query: {} }, res);
    const q = requetes.find((r) => /FROM generated_document d/.test(r.sql));
    assert.match(q.sql, /LEFT JOIN document_fichier fi ON fi\.document_id = d\.id/);
    assert.match(q.sql, /fi\.nom AS fichier_nom, DATE_FORMAT\(fi\.importe_le, '%Y-%m-%d %H:%i'\) AS importe_le/);
    assert.doesNotMatch(q.sql, /fi\.bytes/, 'jamais les octets : quelques mégaoctets par ligne');
    assert.deepStrictEqual(q.params, ['o1', 'c1']);
    assert.strictEqual(corps.data.length, 1);

    // Sans la table : les clés existent quand même, nulles, et la requête ne la cite pas.
    colonnes = new Set(); requetes = [];
    await listCompanyDocuments({ user: { organization_id: 'o1' }, params: { id: 'c1' }, query: { session_id: 's1' } }, res);
    const q2 = requetes.find((r) => /FROM generated_document d/.test(r.sql));
    assert.match(q2.sql, /NULL AS fichier_nom, NULL AS importe_le/);
    assert.doesNotMatch(q2.sql, /document_fichier/);
    assert.match(q2.sql, /AND d\.session_id = \?/);
    assert.deepStrictEqual(q2.params, ['o1', 'c1', 's1']);
});

test('LE PARCOURS DE GROUPE n\'offre l\'import que sur un document de GROUPE (ou une remise)', () => {
    /* Une étape « stagiaire » vue depuis l'entreprise porte des compteurs (2/3 signés), pas UN
       document : l'importer ici ne dirait pas pour quel stagiaire. Elle s'importe depuis sa fiche.
       Une REMISE fait exception : l'école la dépose de là, stagiaire par stagiaire. */
    assert.match(PARCOURS, /\{onImport && importPossible\(step\) && \(/);
    assert.match(PARCOURS, /return !\(isGroup\(s\) && !s\.company_level\);/);
    assert.match(PARCOURS, /"Rattacher à cette étape l'exemplaire signé renvoyé par l'entreprise \(e-mail, scan\)"/);
});

test('LA FICHE ENTREPRISE : vérifier, préparer au besoin par le chemin de « Préparer », puis rattacher', () => {
    const envoyer = fonction(ENTREPRISE, 'async function envoyerImportGroupe');
    const verif = envoyer.indexOf('const refus = refusDocumentRecu(file);');
    const prep = envoyer.indexOf('await createCompanyDocument(id, { session_id: viewSessionId, template_slug: cible.slug });');
    const imp = envoyer.indexOf('await importDocumentFile(fd);');
    assert.ok(verif > 0 && prep > verif && imp > prep, 'le fichier est vérifié AVANT toute préparation');
    assert.match(envoyer, /if \(refus\) \{ setStatus\(\{ type: "error", message: refus \}\); return; \}/);
    assert.match(envoyer, /fd\.append\("document_id", docId\);/, 'la route existante, par identifiant : aucun second chemin de création');
    assert.match(envoyer, /if \(prepares\.length > 1\) \{/, 'préparé en plusieurs documents (un par OPCO) : on s\'arrête et on le dit');
    assert.match(envoyer, /e\.target\.value = "";/, 'réimporter le même fichier doit redéclencher « change »');

    const demander = fonction(ENTREPRISE, 'function demanderImportGroupe');
    assert.match(demander, /cibleImportGroupe\(documentsDeLEtape\(companyDocs, step\.key, viewSessionId\)\)/);
    assert.match(demander, /if \(cible\.refus === "plusieurs"\)/);
    assert.match(demander, /if \(cible\.refus === "signe"\)/);

    const boutons = fonction(ENTREPRISE, 'function boutonsDocumentEntreprise');
    assert.match(boutons, /\{!signeDansLApplication\(d\) && \(/, 'rien à importer sur un document signé dans l\'application');
    assert.match(boutons, /onClick=\{\(\) => demanderImportDocument\(d\)\}/, 'chaque ligne (un document par OPCO) a le sien');
    assert.match(boutons, /\{\(d\.importe_le \|\| d\.template_slug\) && \(/, 'un document importé se télécharge même sans modèle');

    const telecharger = fonction(ENTREPRISE, 'async function telechargerPdf');
    assert.match(telecharger, /if \(d\.importe_le\) await downloadDocumentImporte\(d\.id, d\.fichier_nom\);/,
        'le fichier REÇU fait foi, pas un PDF recomposé depuis le modèle');
    assert.match(ENTREPRISE, /<input ref=\{fichierRef\} type="file" style=\{\{ display: "none" \}\} onChange=\{envoyerImportGroupe\} \/>/);
    assert.match(fonction(ENTREPRISE, 'function ouvrirSelecteur'), /fichierRef\.current\.accept = cible\.remise \? ACCEPT_PIECE : ACCEPT_DOCUMENT;/);
});
