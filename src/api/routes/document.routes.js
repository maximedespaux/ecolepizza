const express = require('express');
const {
    listDocuments, createDocument, getDocument, sendDocument, signDocument, deleteDocument,
} = require('../controllers/document.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Actions d'administration : réservées au personnel.
router.get('/', authenticateToken, authorizeRoles(...STAFF_ROLES), listDocuments);
router.post('/', authenticateToken, authorizeRoles(...STAFF_ROLES), createDocument);
router.post('/:id/send', authenticateToken, authorizeRoles(...STAFF_ROLES), sendDocument);
router.delete('/:id', authenticateToken, authorizeRoles(...STAFF_ROLES), deleteDocument);

// Consultation / signature : accessibles au stagiaire (contrôle de propriété dans le contrôleur).
router.get('/:id', authenticateToken, getDocument);
router.post('/:id/sign', authenticateToken, signDocument);

module.exports = router;
