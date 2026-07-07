const express = require('express');
const {
    listDocuments, createDocument, getDocument, sendDocument, signDocument, deleteDocument,
} = require('../controllers/document.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Consultation de la liste : tout le personnel, y compris le formateur.
router.get('/', authenticateToken, authorizeRoles(...STAFF_ROLES), listDocuments);
// Génération / envoi / suppression : bureau uniquement (pas le formateur).
router.post('/', authenticateToken, authorizeRoles(...ADMIN_ROLES), createDocument);
router.post('/:id/send', authenticateToken, authorizeRoles(...ADMIN_ROLES), sendDocument);
router.delete('/:id', authenticateToken, authorizeRoles(...ADMIN_ROLES), deleteDocument);

// Consultation / signature d'un document : stagiaire propriétaire ou personnel
// (contrôle de propriété dans le contrôleur).
router.get('/:id', authenticateToken, getDocument);
router.post('/:id/sign', authenticateToken, signDocument);

module.exports = router;
