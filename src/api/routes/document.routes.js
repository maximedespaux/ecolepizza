const express = require('express');
const {
    listDocuments, createDocument, getDocument, downloadDocx, downloadPdf, previewHtml, sendDocument, signDocument, deleteDocument, createSignLink, checkDocumentConditions,
} = require('../controllers/document.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Consultation de la liste : tout le personnel, y compris le formateur.
router.get('/', authenticateToken, authorizeRoles(...STAFF_ROLES), listDocuments);
// Génération / envoi / suppression : bureau uniquement (pas le formateur).
router.post('/', authenticateToken, authorizeRoles(...ADMIN_ROLES), createDocument);
// Vérifie qu'un modèle s'applique aux dossiers choisis (règles de l'organisme) — aperçu avant génération.
router.post('/check-conditions', authenticateToken, authorizeRoles(...ADMIN_ROLES), checkDocumentConditions);
router.post('/:id/send', authenticateToken, authorizeRoles(...ADMIN_ROLES), sendDocument);
router.delete('/:id', authenticateToken, authorizeRoles(...ADMIN_ROLES), deleteDocument);

// Consultation / signature d'un document : stagiaire propriétaire ou personnel
// (contrôle de propriété dans le contrôleur).
router.get('/:id', authenticateToken, getDocument);
router.get('/:id/preview', authenticateToken, previewHtml);
router.get('/:id/pdf', authenticateToken, downloadPdf);
router.get('/:id/docx', authenticateToken, downloadDocx);
router.post('/:id/sign', authenticateToken, signDocument);
// Lien de signature partageable (représentant entreprise…) : bureau uniquement.
router.post('/:id/sign-link', authenticateToken, authorizeRoles(...ADMIN_ROLES), createSignLink);

module.exports = router;
