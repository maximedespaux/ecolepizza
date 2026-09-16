/**
 * UN DOCUMENT REÇU PAR E-MAIL, RATTACHÉ À SON ÉTAPE.
 *
 * LE BESOIN. Le parcours fait signer dans l'application, mais certains documents reviennent
 * autrement : un stagiaire sans accès, une entreprise qui renvoie la convention scannée, un OPCO
 * qui écrit. L'étape restait « à faire » alors que le document existait — le dossier paraissait
 * incomplet pendant que le classeur, lui, était complet.
 *
 * CE QUE CES TESTS PROTÈGENT AVANT TOUT : l'honnêteté de la trace. L'étape passe à SIGNÉ et compte
 * dans le score de conformité — c'est le choix retenu, le document signé faisant foi quel que soit
 * le canal. Mais aucune signature électronique n'a eu lieu ici. Écrire `signature_data` ou
 * `signer_name` fabriquerait la preuve d'un geste qui n'a pas eu lieu, et rendrait indiscernable,
 * six mois plus tard, un document signé dans l'application d'un document rentré par courriel.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const RACINE = path.join(API, '..', '..');
const CTRL = fs.readFileSync(path.join(API, 'controllers/document.controller.js'), 'utf8');
const ROUTES = fs.readFileSync(path.join(API, 'routes/document.routes.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(RACINE, 'src/app/ui/pages/StagiaireDetail.jsx'), 'utf8');
const PARCOURS = fs.readFileSync(path.join(RACINE, 'src/app/ui/components/EnrollmentParcours.jsx'), 'utf8');
const LABELS = fs.readFileSync(path.join(RACINE, 'src/app/ui/lib/auditLabels.js'), 'utf8');

const bloc = CTRL.slice(CTRL.indexOf('const importDocumentFile'), CTRL.indexOf('const getDocumentFile'));

test('l\'étape passe à SIGNÉ, mais AUCUNE signature n\'est fabriquée', () => {
    assert.match(bloc, /UPDATE generated_document SET status = 'SIGNE', signed_at = NOW\(\)/);
    /* La ligne qui compte vraiment : on n'écrit ni l'un ni l'autre. Les ajouter « pour faire
       propre » effacerait la seule différence entre un document signé ici et un document reçu. */
    assert.doesNotMatch(bloc, /signature_data/, 'aucun tracé de signature inventé');
    assert.doesNotMatch(bloc, /signer_name/, 'aucun signataire inventé');
    // Qui a importé et quand : c'est ÇA, la trace honnête.
    assert.match(bloc, /importe_par/);
    assert.match(LABELS, /'document\.import': \['Document reçu et importé'/,
        'le journal doit dire « importé », pas « signé »');
});

test('une étape jamais générée est créée par le MÊME chemin que « Générer »', () => {
    /* Recopier la préparation ici aurait fait diverger les deux : rattachement aux inscriptions,
       suppression des doublons non signés, avancement du CRM. Deux chemins pour une même étape
       finissent toujours par produire deux étapes différentes. */
    assert.match(bloc, /documentId = await prepareLearnerDoc\(conn, orgId, \{/);
    assert.match(bloc, /learnerId: learner_id, type, templateSlug: template_slug \|\| null, title,/);
});

test('les inscriptions sont revérifiées contre CE stagiaire', () => {
    // Sans ce contrôle, un identifiant deviné rattacherait le document au dossier d'un autre.
    assert.match(bloc, /WHERE id IN \(\?\) AND organization_id = \? AND learner_id = \?/);
});

test('réimporter REMPLACE au lieu d\'empiler', () => {
    /* Un seul fichier par étape : c'est LE document signé. Empiler des versions laisserait sans
       réponse la seule question qui compte — laquelle fait foi ? */
    assert.match(bloc, /DELETE FROM document_fichier WHERE document_id = \?/);
    const sql = fs.readFileSync(path.join(RACINE, 'database/migrations/145_document_importe.sql'), 'utf8');
    assert.match(sql, /UNIQUE KEY uq_document_fichier \(document_id\)/, 'la base l\'impose aussi');
});

test('le fichier est CHIFFRÉ au repos, et la taille reste lisible', () => {
    // Une convention signée porte un nom, une adresse et une image de signature : même traitement
    // que les scans d'identité des pièces.
    assert.match(bloc, /encryptBytes\(f\.buffer\), f\.buffer\.length/);
    assert.match(CTRL, /const clair = decryptBytes\(f\.bytes\);/, 'déchiffré seulement à la lecture');
});

test('sans la migration, on le DIT au lieu de renvoyer une erreur 500', () => {
    assert.match(bloc, /ER_NO_SUCH_TABLE/);
    assert.match(bloc, /Migration 145 non jouée/);
});

test('la liste du dossier ne charge JAMAIS le fichier', () => {
    /* Quelques mégaoctets par ligne transformeraient l'ouverture d'un dossier en téléchargement.
       L'écran a besoin de savoir qu'un fichier existe, pas de le recevoir. */
    const liste = CTRL.slice(CTRL.indexOf('const listDocuments'), CTRL.indexOf('async function prepareLearnerDoc'));
    assert.match(liste, /fi\.nom AS fichier_nom, fi\.taille AS fichier_taille, fi\.importe_le/);
    assert.doesNotMatch(liste, /fi\.bytes/, 'le blob ne doit pas entrer dans la liste');
    // Et la table peut ne pas exister : la jointure est conditionnelle.
    assert.match(liste, /colonneExiste\(conn, 'document_fichier', 'document_id'\)/);
});

test('l\'écran propose l\'import sur une étape, jamais sur un QCM', () => {
    /* Un questionnaire ne se remplace pas par un fichier : sans réponses enregistrées il ne prouve
       rien et ne se rejoue pas. */
    assert.match(PARCOURS, /onImport && !String\(step\.key \|\| ""\)\.startsWith\("quiz:"\)/);
    // Le sélecteur se réarme, sinon réimporter le MÊME fichier ne déclencherait aucun `change`.
    assert.match(PAGE, /e\.target\.value = "";/);
    // Et la mention « reçu » s'affiche : c'est elle qui préserve la distinction à l'écran.
    assert.match(PAGE, /reçu et importé le \{dateHeure\(d\.importe_le\)\}/);
});

test('la route est gardée, et le fichier se relit', () => {
    assert.match(ROUTES, /router\.post\('\/import', authenticateToken, authorizeRoles\(\.\.\.ADMIN_ROLES\), upload\.single\('file'\), importDocumentFile\)/);
    assert.match(ROUTES, /router\.get\('\/:id\/fichier', authenticateToken, authorizeRoles\(\.\.\.STAFF_ROLES\), getDocumentFile\)/);
});

test('l\'APERÇU sert le fichier reçu, pas le modèle régénéré', () => {
    /* LE DÉFAUT : l'aperçu rendait le MODÈLE. On importait la convention signée, on cliquait
       « Aperçu », et on voyait une convention VIERGE — l'écran montrait autre chose que ce qui
       fait foi. Le petit bouton de téléchargement était le seul chemin vers le vrai document. */
    const MODALE = fs.readFileSync(
        path.join(RACINE, 'src/app/ui/components/DocumentViewModal.jsx'), 'utf8');
    // Le serveur annonce le fichier et NE rend pas de corps pour un document importé.
    assert.match(CTRL, /const html = \(importe \|\| modele_fichier\) \? null : await buildDocHtml\(/);
    /* L'écran n'appelle même plus le rendu, et attend de SAVOIR avant de décider. La garde
       couvre désormais les DEUX corps-fichiers : le document reçu par e-mail, et le modèle
       figé (un PDF servi tel quel). Même raison dans les deux cas — régénérer le modèle
       montrerait autre chose que ce qui fait foi. */
    assert.match(MODALE, /if \(doc\.importe \|\| doc\.modele_fichier\) return;/);
    assert.match(MODALE, /\}, \[id, doc\]\);/, 'l\'effet dépend de `doc`, sinon il décide avant de savoir');
    // PDF en ligne, image en ligne, tout le reste par un lien : un cadre vide ferait croire à un
    // document blanc.
    assert.match(MODALE, /\/pdf\/i\.test\(fichier\.mime/);
    assert.match(MODALE, /\^image\\\//);
    assert.match(MODALE, /Ouvrir le document</);
    /* ET LES IMPORTS SUIVENT. C'est le défaut d'hier, à l'identique : un symbole utilisé sans
       être importé ne se voit ni à la compilation ni au build, seulement à l'exécution. */
    assert.match(MODALE, /import \{[^}]*API_BASE_URL[^}]*\} from "\.\.\/api\/apiClient\.js"/);
    assert.match(MODALE, /import \{ dateHeure.*\} from "\.\.\/lib\/format\.js"/);
});

test('le PDF téléchargé est le fichier reçu, quand c\'en est un', () => {
    /* Même raison que le PDF signé figé : ce qui fait foi ne se régénère pas. Réservé au PDF —
       servir une image sous « application/pdf » donnerait un fichier que rien n'ouvre. */
    /* Bornes prises sur le corps RÉEL : `downloadDocx` est déclaré AVANT `downloadPdf` dans le
       fichier, et la tranche sortait vide — un test qui ne lit rien passe pour vert. */
    const deb = CTRL.indexOf('const downloadPdf');
    const pdf = CTRL.slice(deb, CTRL.indexOf('const previewHtml', deb));
    assert.ok(pdf.length > 500, 'la tranche doit contenir le corps de downloadPdf');
    assert.match(pdf, /if \(fi && \/pdf\/i\.test\(fi\.mime \|\| ''\)\)/);
    assert.ok(pdf.indexOf('document_fichier') < pdf.indexOf('loadSignedPdf'),
        'le fichier reçu est consulté AVANT le PDF figé');
});
