/**
 * LES DOCUMENTS DANS LES ÉTAPES DU PARCOURS (fiche stagiaire, puis fiche entreprise).
 *
 * Demandé le 2026-09-21 : « intégrer les boutons voir, télécharger, supprimer (ceux de la liste
 * du dessous) aux cartes des étapes, pour réduire la hauteur de la page, et intégrer “Préparer un
 * document” dans l'étape courante, pour ne plus descendre ».
 *
 * CE QUE LA FICHE FAISAIT : chaque document apparaissait DEUX fois — une carte dans le parcours,
 * puis une ligne dans la liste du dessous, seule à porter les gestes ; et « Préparer ce document »
 * faisait défiler la page jusqu'à un formulaire placé sous le parcours. Ce fichier gèle ce qui
 * rend le nouveau rangement sûr : aucun document ne disparaît (ceux qu'aucune étape ne montre
 * restent listés), une corbeille désormais sous la main demande confirmation, et le formulaire
 * s'ouvre dans l'étape.
 *
 * LA FICHE ENTREPRISE a reçu le même traitement le même jour (« same for the company page »),
 * avec ses documents de GROUPE : une étape peut en montrer plusieurs (un par OPCO), et la décision
 * du 2026-07-15 reste en place — l'étape de groupe n'offre que « Préparer le document ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const FICHE = fs.readFileSync(path.join(UI, 'pages', 'StagiaireDetail.jsx'), 'utf8');
const PARCOURS = fs.readFileSync(path.join(UI, 'components', 'EnrollmentParcours.jsx'), 'utf8');
const fonction = (src, debut) => src.slice(src.indexOf(debut), src.indexOf('\n  }\n', src.indexOf(debut)));

// ── Aucun document ne disparaît ─────────────────────────────────────────────────────────────
const DOCS = [
    { id: 'contrat', title: 'Contrat', formations: 'RS7404' },
    { id: 'contrat-bis', title: 'Contrat (généré deux fois)', formations: 'RS7404' },
    { id: 'attestation', title: 'Attestation hors parcours', formations: 'RS7404' },
    { id: 'niv1', title: 'Convention NIV1H', formations: 'NIV1H' },
    { id: 'groupe', title: 'Convention regroupée', formations: 'NIV1H, RS7404' },
    { id: 'orphelin', title: 'Sans formation connue', formations: null },
];

test('LA LISTE DU DESSOUS garde tout ce qu\'aucune étape ne montre — et rien d\'autre', async () => {
    const { documentsHorsParcours } = await import('../../app/ui/lib/documentsDossier.js');
    const ids = (liste) => liste.map((d) => d.id);
    // Onglet RS7404 : le contrat est sur sa carte ; son doublon, l'attestation, le regroupé et
    // l'inconnu restent listés. La convention NIV1H, elle, s'affiche sous SON onglet.
    assert.deepStrictEqual(ids(documentsHorsParcours(DOCS, new Set(['contrat']), 'RS7404')),
        ['contrat-bis', 'attestation', 'groupe', 'orphelin']);
    // Un document regroupé, déjà sur une carte : plus dans la liste.
    assert.deepStrictEqual(ids(documentsHorsParcours(DOCS, ['contrat', 'groupe'], 'RS7404')),
        ['contrat-bis', 'attestation', 'orphelin'], 'un tableau vaut un ensemble');
    // Une formation sans parcours (aucune étape) : tous ses documents sont listés.
    assert.deepStrictEqual(ids(documentsHorsParcours(DOCS, new Set(), 'NIV1H')), ['niv1', 'groupe', 'orphelin']);
    // Sans formation d'onglet, rien n'est filtré par formation.
    assert.strictEqual(documentsHorsParcours(DOCS, null, null).length, DOCS.length);
});

test('la fiche ne liste que ces documents-là, et rien tant que le parcours n\'est pas arrivé', () => {
    assert.match(FICHE, /docsEtapes \? documentsHorsParcours\(docs, docsEtapes, codeOnglet\) : \[\]/,
        'parcours pas encore reçu : rien, plutôt que tout puis presque rien');
    assert.match(FICHE, /const autres = enrollments\.length === 0 \? docs/, 'sans inscription, pas de parcours : tout est listé');
    assert.match(FICHE, /onCharge=\{\(d\) => setDocsEtapes\(new Set\(\(d\?\.steps \|\| \[\]\)\.map\(\(x\) => x\.docId\)\.filter\(Boolean\)\)\)\}/,
        'un parcours illisible (null) ne cache aucun document');
    assert.match(FICHE, /onClick=\{\(\) => \{ setParcoursEnr\(e\.id\); setDocsEtapes\(null\); \}\}/,
        'changer d\'onglet oublie les documents des étapes de l\'onglet précédent');
});

// ── Les gestes sur les cartes ───────────────────────────────────────────────────────────────
test('CHAQUE CARTE PORTE LES GESTES DE SON DOCUMENT, les mêmes que la liste', () => {
    assert.match(FICHE, /renderGestes=\{gestesEtape\}/);
    assert.match(fonction(FICHE, 'function gestesEtape'), /\{boutonsDocument\(d\)\}/);
    const bas = FICHE.slice(FICHE.indexOf('{autres.length > 0 && ('));
    assert.match(bas, /\{boutonsDocument\(d\)\}/, 'une seule définition des boutons : ils ne divergeront pas');
    const boutons = fonction(FICHE, 'function boutonsDocument');
    for (const icone of ['eye', 'send', 'download', 'trash']) assert.match(boutons, new RegExp(`name="${icone}"`));
    // Un document importé se DIT sur sa carte : « importé le … », pas seulement dans la liste.
    assert.match(fonction(FICHE, 'function gestesEtape'), /d\.importe_le \? `importé le \$\{dateFr\(d\.importe_le\)\}`/);
});

test('UNE CARTE N\'EST PAS UN BOUTON QUI EN CONTIENT D\'AUTRES', () => {
    /* La corbeille dans le bouton de sélection : HTML invalide, et le clic choisissait l'étape en
       plus de supprimer. La carte CONTIENT le bouton de sélection, puis ses gestes, à côté. */
    assert.match(PARCOURS, /<\/button>\s*\{gestes && <div className="parc-etape-gestes">\{gestes\}<\/div>\}/);
    assert.match(PARCOURS, /<div className=\{`parc-etape\$\{on \? " sel" : ""\}/);
    assert.doesNotMatch(PARCOURS, /<button type="button" onClick=\{\(\) => choisir\(s\.key\)\} aria-pressed=\{on\}\s+className=\{`parc-etape/);
});

test('LA CORBEILLE DEMANDE CONFIRMATION, et prévient quand le document est signé', () => {
    /* Elle vit désormais sur chaque carte, à côté de l'aperçu : un clic de travers y est plus
       probable. Et le serveur supprime tout — signature et PDF scellé compris. */
    const suppr = fonction(FICHE, 'async function handleDelete');
    const confirmer = suppr.indexOf('window.confirm(');
    assert.ok(confirmer > -1 && confirmer < suppr.indexOf('await deleteDocument(d.id)'), 'confirmée AVANT la suppression');
    assert.match(suppr, /const signe = d\.status === "SIGNE";/);
    assert.match(suppr, /Ce document est SIGNÉ : sa signature et son PDF scellé seront supprimés avec lui\./);
    assert.doesNotMatch(FICHE, /handleDelete\(d\.id\)/, 'chaque appel donne le document, pas son seul identifiant');
});

// ── « Préparer un document » dans l'étape ───────────────────────────────────────────────────
test('« PRÉPARER CE DOCUMENT » OUVRE LE FORMULAIRE DANS L\'ÉTAPE, sans faire défiler la page', () => {
    assert.match(FICHE, /renderPreparation=\{formulairePreparation\}/);
    assert.doesNotMatch(FICHE, /sd-prepare/, 'plus d\'ancre plus bas vers laquelle descendre');
    assert.doesNotMatch(fonction(FICHE, 'function prepareStep'), /scrollIntoView/);
    assert.match(PARCOURS, /if \(renderPreparation\) setPreparation\(step\.key\);\s+onPrepare\?\.\(step\.key, step\);/,
        'le formulaire s\'ouvre ici, et la page pré-remplit toujours le modèle et le dossier');
    // Généré : le formulaire se referme — sinon il resterait ouvert sur une étape déjà faite.
    const preparer = fonction(FICHE, 'async function handlePrepare');
    assert.ok(preparer.indexOf('fermer?.();') > preparer.indexOf('await createDocument('), 'refermé après la génération, pas avant');
    // Un document hors parcours reste possible : la case « Autre document » ouvre le choix du modèle.
    assert.match(fonction(FICHE, 'function formulairePreparation'), /\{!etape && \(\s+<SelectField label="Modèle de document"/);
    assert.match(PARCOURS, /\{renderPreparation && \(\s+<div className=\{`parc-etape parc-autre/);
    // Le formulaire appartient à SON étape : en choisir une autre le referme.
    assert.match(PARCOURS, /setPreparation\(cle === AUTRE \? AUTRE : \(p\) => \(p === cle \? p : null\)\);/);
});

test('une étape de REMISE ne propose plus de préparer un document', () => {
    /* Sa clé ne désigne aucun modèle : le formulaire ouvert pour elle ne pouvait que répondre
       « Sélectionnez un modèle de document ». Ce que l'école remet se marque dans son panneau. */
    assert.match(PARCOURS, /if \(s\.piece \|\| s\.remise\) return null;/);
});

// ── La fiche entreprise, même traitement (demandé le 2026-09-21) ───────────────────────────
const ENTREPRISE = fs.readFileSync(path.join(UI, 'pages', 'EntrepriseDetail.jsx'), 'utf8');
const appelParcours = ENTREPRISE.slice(ENTREPRISE.indexOf('<EnrollmentParcours'), ENTREPRISE.indexOf('/>', ENTREPRISE.indexOf('<EnrollmentParcours')));

test('ENTREPRISE : une étape de groupe montre TOUS ses documents — un par OPCO', async () => {
    /* Le serveur produit un document par OPCO quand les stagiaires n'ont pas tous le même, et
       l'étape ne désigne que le plus récent. Rattacher au seul `docId` aurait envoyé la convention
       du second OPCO dans « Autres documents », loin de son étape. */
    const { documentsDeLEtape, documentsEntrepriseHorsParcours } = await import('../../app/ui/lib/documentsDossier.js');
    const DOCS = [
        { id: 'c1', title: 'Convention de formation — AKTO', template_slug: 'convention-groupe', session_id: 's38' },
        { id: 'c2', title: 'Convention de formation — OCAPIAT', template_slug: 'convention-groupe', session_id: 's38' },
        { id: 'c3', title: 'Convention de formation — AKTO', template_slug: 'convention-groupe', session_id: 's12' },
        { id: 'l1', title: 'Liste d\'émargement groupe', template_slug: 'emargement-groupe', session_id: 's38' },
        { id: 'x1', title: 'Convention d\'une session disparue', template_slug: 'convention-groupe', session_id: 's-ancienne' },
    ];
    assert.deepStrictEqual(documentsDeLEtape(DOCS, 'convention-groupe', 's38').map((d) => d.id), ['c1', 'c2'],
        'les deux OPCO de la session affichée, pas la convention de l\'autre session');
    // Session s38 : les conventions sont sur leur étape ; restent le modèle hors parcours et la session disparue.
    assert.deepStrictEqual(documentsEntrepriseHorsParcours(DOCS, new Set(['convention-groupe']), 's38', ['s38', 's12']).map((d) => d.id),
        ['l1', 'x1'], 'la session s12 s\'affiche sous la sienne ; une session disparue n\'a de place nulle part : listée');
    assert.deepStrictEqual(documentsEntrepriseHorsParcours(DOCS, [], 's12', ['s38', 's12']).map((d) => d.id), ['c3', 'x1'],
        'parcours sans étape de groupe : tout ce qui est de la session est listé');
});

test('ENTREPRISE : les cartes portent les gestes, le formulaire s\'ouvre dans l\'étape', () => {
    assert.match(appelParcours, /renderGestes=\{gestesEtapeGroupe\}/);
    assert.match(appelParcours, /renderPreparation=\{formulaireGroupe\}/);
    assert.match(appelParcours, /onCharge=\{\(d\) => setSlugsEtapes\(new Set\(\(d\?\.steps \|\| \[\]\)\.filter\(\(x\) => x\.company_level\)\.map\(\(x\) => x\.key\)\)\)\}/);
    const gestes = fonction(ENTREPRISE, 'function gestesEtapeGroupe');
    assert.match(gestes, /if \(!s\.company_level\) return null;/, 'une étape « stagiaire » se génère depuis chaque fiche');
    assert.match(gestes, /documentsDeLEtape\(companyDocs, s\.key, viewSessionId\)/, 'par modèle et par session, pas par le seul docId');
    assert.match(fonction(ENTREPRISE, 'function boutonsDocumentEntreprise'), /deleteCompanyDoc\(d\.id, d\.title, d\.status === "SIGNE"\)/,
        'la corbeille garde la confirmation de la page, plus ferme pour un document signé');
    // Plus de carte « Préparer un document » vers laquelle défiler, et un seul formulaire.
    assert.doesNotMatch(ENTREPRISE, /ent-prepare/);
    assert.doesNotMatch(fonction(ENTREPRISE, 'function prepareCompanyDoc'), /scrollIntoView/);
    assert.strictEqual(ENTREPRISE.split('<form onSubmit={(ev) => prepareGroupDoc(ev, fermer)}').length - 1, 1);
    const generer = fonction(ENTREPRISE, 'async function prepareGroupDoc');
    assert.ok(generer.indexOf('fermer?.();') > generer.indexOf('await createCompanyDocument('), 'refermé après la génération');
    // La liste du bas : seulement ce qu'aucune étape ne montre, et rien tant que le parcours n'est pas arrivé.
    assert.match(ENTREPRISE, /slugsEtapes \? documentsEntrepriseHorsParcours\(companyDocs, slugsEtapes, viewSessionId,/);
    assert.match(ENTREPRISE, /onChange=\{\(e\) => \{ setViewSessionId\(e\.target\.value\); setSlugsEtapes\(null\); \}\}/);
});

test('ENTREPRISE : l\'étape de groupe n\'offre toujours que « Préparer le document »', () => {
    /* Décision de l'école du 2026-07-15 (f041f830) : ni « Regénérer », ni lien de signature sur
       l'étape — préparer à nouveau remplace la version non signée (nettoyage côté serveur). Les
       gestes du document vivent sur la carte ; l'action de l'étape, elle, ne change pas. */
    assert.match(PARCOURS, /if \(s\.company_level\) return \{ label: "Préparer le document", kind: "prepare" \};/);
    assert.doesNotMatch(appelParcours, /onSignLink/);
});

test('ENTREPRISE : la liste des documents de groupe rend la date de signature', () => {
    /* « signé le … » sur la carte : sans la colonne dans la réponse, la trace s'arrêtait à l'envoi. */
    const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'company.controller.js'), 'utf8');
    const liste = CTRL.slice(CTRL.indexOf('const listCompanyDocuments'), CTRL.indexOf('const createCompanyDocument'));
    assert.match(liste, /DATE_FORMAT\(signed_at, '%Y-%m-%d %H:%i'\) AS signed_at/);
});
