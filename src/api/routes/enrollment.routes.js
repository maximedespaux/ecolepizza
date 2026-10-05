const express = require('express');
const {
    getEnrollments, getParcours, createEnrollment, updateEnrollment, deleteEnrollment, getRetrait,
    getDocumentsRecuperables, recupererDocuments,
} = require('../controllers/enrollment.controller.js');
const { getNotes, createNote, deleteNote } = require('../controllers/note.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', authenticateToken, getEnrollments);
router.get('/:id/parcours', authenticateToken, getParcours);
// Ce que le retrait emporterait, montré AVANT d'agir (fenêtre de retrait).
router.get('/:id/retrait', authenticateToken, getRetrait);
router.post('/', authenticateToken, createEnrollment);
// Récupération de parcours : les documents orphelins d'une session recréée, puis leur rattachement.
router.get('/:id/documents-recuperables', authenticateToken, getDocumentsRecuperables);
router.post('/:id/recuperer-documents', authenticateToken, recupererDocuments);
router.patch('/:id', authenticateToken, updateEnrollment);
router.delete('/:id', authenticateToken, deleteEnrollment);

// Notes de suivi CRM
router.get('/:id/notes', authenticateToken, getNotes);
router.post('/:id/notes', authenticateToken, createNote);
router.delete('/:id/notes/:noteId', authenticateToken, deleteNote);

module.exports = router;
