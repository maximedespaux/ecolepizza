/**
 * MARQUER UNE ÉTAPE FAITE SANS DOCUMENT — reprise des anciens stagiaires (2026-10-05).
 *
 * Certains documents (CGV, livret d'accueil…) ont bien été remis, mais l'école n'a aucun fichier à
 * stocker et il n'y a rien à importer. On fait avancer l'étape SANS rien fabriquer — ni fichier, ni
 * nom de signataire, ni image de signature — et la trace reste honnête : le journal dit « marquée
 * faite », jamais « signée », et l'écran distingue un « marqué fait » d'une vraie signature. C'est
 * la même exigence que l'import d'un document reçu (document-importe.test.js), ici sans fichier.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const RACINE = path.join(API, '..', '..');
const CTRL = fs.readFileSync(path.join(API, 'controllers/document.controller.js'), 'utf8');
const ROUTES = fs.readFileSync(path.join(API, 'routes/document.routes.js'), 'utf8');
const PARCOURS = fs.readFileSync(path.join(RACINE, 'src/app/ui/components/EnrollmentParcours.jsx'), 'utf8');
const PAGE = fs.readFileSync(path.join(RACINE, 'src/app/ui/pages/StagiaireDetail.jsx'), 'utf8');
const LABELS = fs.readFileSync(path.join(RACINE, 'src/app/ui/lib/auditLabels.js'), 'utf8');

const bloc = CTRL.slice(CTRL.indexOf('const marquerDocumentFait'), CTRL.indexOf('const getDocumentFile'));

test('l\'étape passe à SIGNÉ, SANS fichier ni signature fabriqués', () => {
    assert.match(bloc, /UPDATE generated_document SET status = 'SIGNE', signed_at = NOW\(\) WHERE id = \? AND organization_id = \? AND quiz_id IS NULL/);
    assert.doesNotMatch(bloc, /signature_data/, 'aucune image de signature');
    assert.doesNotMatch(bloc, /signer_name/, 'aucun signataire inventé');
    assert.doesNotMatch(bloc, /document_fichier/, 'aucun fichier : il n\'y en a pas');
    assert.doesNotMatch(bloc, /encryptBytes/, 'rien à chiffrer');
    assert.match(bloc, /logAudit\(req, 'document\.marque_fait'/, 'le journal dit « marquée faite »');
    assert.match(LABELS, /'document\.marque_fait': \['Étape marquée faite'/);
});

test('un QCM ne se marque JAMAIS fait (il importe son résultat, ou se répond dans l\'app)', () => {
    assert.match(bloc, /if \(d\.quiz_id\) return res\.status\(422\)/, 'un document de QCM existant est refusé');
    assert.match(bloc, /if \(req\.body\.quiz_id\) return res\.status\(422\)/, 'et un quiz_id passé à la création aussi');
    assert.match(bloc, /quiz_id IS NULL/, 'ceinture : l\'UPDATE ne touche pas un QCM');
});

test('une étape jamais générée est créée par le MÊME chemin que « Générer »', () => {
    assert.match(bloc, /documentId = await prepareLearnerDoc\(conn, orgId, \{/);
    assert.match(bloc, /WHERE id IN \(\?\) AND organization_id = \? AND learner_id = \?/, 'inscriptions revérifiées contre CE stagiaire');
});

test('le geste est proposé sur un DOCUMENT, jamais QCM / pièce / remise, ni une étape déjà faite', () => {
    assert.match(PARCOURS, /\{onMarquerFait && marquerFaitPossible\(step\) && \(/);
    const i = PARCOURS.indexOf('function marquerFaitPossible');
    const poss = PARCOURS.slice(i, i + 400);
    assert.match(poss, /if \(s\.piece \|\| s\.remise \|\| estQcm\(s\)\) return false;/);
    assert.match(poss, /return e !== "VALIDE" && e !== "SANS_OBJET";/, 'pas une étape déjà faite');
});

test('l\'écran DISTINGUE « marqué fait » d\'une signature (jamais « signé » par erreur)', () => {
    assert.match(PAGE, /const marqueFait = d\.status === "SIGNE" && !d\.quiz_id && !d\.signer_name && !d\.importe_le && !d\.fichier_nom;/);
    assert.match(PAGE, /marqueFait \? `marqué fait le \$\{dateFr\(d\.signed_at\)\}`/);
    assert.match(PAGE, /onMarquerFait=\{marquerFait\}/, 'le geste est câblé au parcours');
});

test('la route est gardée (bureau), et n\'est pas confondue avec un :id', () => {
    assert.match(ROUTES, /router\.post\('\/marquer-fait', authenticateToken, authorizeRoles\(\.\.\.ADMIN_ROLES\), marquerDocumentFait\)/);
});

test('l\'endpoint est en JSON : enrollment_ids est accepté en TABLEAU, pas seulement en chaîne', () => {
    /* La route est en JSON (pas multipart comme l'import) : express livre enrollment_ids en tableau.
       Un JSON.parse dessus échouait et l'étape repartait « inscription requise » à tort (vu le
       2026-10-05 sur le livret d'accueil). On accepte les deux formes. */
    assert.match(bloc, /let enrIds = req\.body\.enrollment_ids;/);
    assert.match(bloc, /if \(typeof enrIds === 'string'\)/, 'une chaîne reste parsée');
    assert.match(bloc, /if \(!Array\.isArray\(enrIds\)\) enrIds = \[\];/);
});

test('un document de GROUPE se marque aussi fait (CGV d\'entreprise), sans fichier', () => {
    const ENT = fs.readFileSync(path.join(RACINE, 'src/app/ui/pages/EntrepriseDetail.jsx'), 'utf8');
    assert.match(ENT, /onMarquerFait=\{marquerFaitGroupe\}/, 'le geste est câblé au parcours de groupe');
    const i = ENT.indexOf('async function faireMarquerGroupe');
    const mg = ENT.slice(i, i + 1700);
    assert.match(mg, /createCompanyDocument\(id, \{ session_ids:/, 'créé par le même chemin que « Préparer »');
    assert.match(mg, /marquerDocumentFait\(\{ document_id: docId \}\)/, 'puis marqué par son id');
    // La trace distingue « marqué fait » d'une signature, même côté entreprise.
    assert.match(ENT, /d\.status === "SIGNE" && !d\.signer_name && !d\.fichier_nom\) \? `marqué fait le/);
    // Et pour distinguer, la liste des documents de groupe rend bien le nom du signataire.
    const COMP = fs.readFileSync(path.join(API, 'controllers/company.controller.js'), 'utf8');
    const j = COMP.indexOf('const listCompanyDocuments = async');
    assert.match(COMP.slice(j, j + 1200), /d\.status, d\.session_id, d\.signer_name,/);
});
