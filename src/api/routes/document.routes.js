const express = require('express');
const multer = require('multer');
const {
    listDocuments, createDocument, getDocument, downloadDocx, downloadPdf, previewHtml, sendDocument, signDocument, deleteDocument, createSignLink, checkDocumentConditions,
    importDocumentFile, getDocumentFile,
} = require('../controllers/document.controller.js');
const { signerMonDocument } = require('../controllers/intervenant.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();

/* UN SEUL FICHIER, 25 Mo — le même plafond que l'import d'archives Qualiopi. En mémoire, comme
   partout dans l'application : tout est stocké EN BASE, jamais sur le disque du serveur. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

// Consultation de la liste : tout le personnel, y compris le formateur.
router.get('/', authenticateToken, authorizeRoles(...STAFF_ROLES), listDocuments);
// Génération / envoi / suppression : bureau uniquement (pas le formateur).
router.post('/', authenticateToken, authorizeRoles(...ADMIN_ROLES), createDocument);
// Vérifie qu'un modèle s'applique aux dossiers choisis (règles de l'organisme) — aperçu avant génération.
router.post('/check-conditions', authenticateToken, authorizeRoles(...ADMIN_ROLES), checkDocumentConditions);
/* DÉCLARÉ AVANT `/:id/...` génériques ? Non : « import » n'est pas un identifiant, il ne peut
   pas être confondu avec un `:id`. En revanche l'ordre compte face à `/:id` tout court, plus bas. */
router.post('/import', authenticateToken, authorizeRoles(...ADMIN_ROLES), upload.single('file'), importDocumentFile);
// Relire le document importé : tout le personnel, comme l'aperçu d'un document généré.
router.get('/:id/fichier', authenticateToken, authorizeRoles(...STAFF_ROLES), getDocumentFile);
router.post('/:id/send', authenticateToken, authorizeRoles(...ADMIN_ROLES), sendDocument);
router.delete('/:id', authenticateToken, authorizeRoles(...ADMIN_ROLES), deleteDocument);

// Consultation / signature d'un document : stagiaire propriétaire ou personnel
// (contrôle de propriété dans le contrôleur).
router.get('/:id', authenticateToken, getDocument);
router.get('/:id/preview', authenticateToken, previewHtml);
router.get('/:id/pdf', authenticateToken, downloadPdf);
router.get('/:id/docx', authenticateToken, downloadDocx);
router.post('/:id/sign', authenticateToken, signDocument);
/* SIGNER LES CADRES QU'ON M'A ATTRIBUÉS (formateur, membre du jury…) — même geste, même garde que
   l'espace intervenant : `signerMonDocument` ne signe que les cases dont `user_id` est le mien.
   Le suffixe « /sign » en fait un acte de PARTICIPANT, pas une écriture de la rubrique (cf.
   sectionAccess.middleware) : un formateur en lecture seule sur Stagiaires signe quand même SA case. */
router.post('/:id/mes-cases/sign', authenticateToken, signerMonDocument);
// Lien de signature partageable (représentant entreprise…) : bureau uniquement.
router.post('/:id/sign-link', authenticateToken, authorizeRoles(...ADMIN_ROLES), createSignLink);

module.exports = router;
