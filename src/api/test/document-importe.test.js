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
