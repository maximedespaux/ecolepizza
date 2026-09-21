/**
 * LES DOCUMENTS DANS LES ÉTAPES DU PARCOURS (fiche stagiaire).
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

test('la fiche entreprise garde son chemin : sans formulaire fourni, « Préparer » appelle la page', () => {
    const ENTREPRISE = fs.readFileSync(path.join(UI, 'pages', 'EntrepriseDetail.jsx'), 'utf8');
    const appel = ENTREPRISE.slice(ENTREPRISE.indexOf('<EnrollmentParcours'), ENTREPRISE.indexOf('/>', ENTREPRISE.indexOf('<EnrollmentParcours')));
    assert.doesNotMatch(appel, /renderPreparation|renderGestes/);
    assert.match(appel, /onPrepare=\{prepareCompanyDoc\}/);
});
