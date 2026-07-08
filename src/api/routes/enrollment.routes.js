const express = require('express');
const {
    getEnrollments, getParcours, createEnrollment, updateEnrollment, deleteEnrollment,
} = require('../controllers/enrollment.controller.js');
const { getNotes, createNote, deleteNote } = require('../controllers/note.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', authenticateToken, getEnrollments);
router.get('/:id/parcours', authenticateToken, getParcours);
router.post('/', authenticateToken, createEnrollment);
router.patch('/:id', authenticateToken, updateEnrollment);
router.delete('/:id', authenticateToken, deleteEnrollment);

// Notes de suivi CRM
router.get('/:id/notes', authenticateToken, getNotes);
router.post('/:id/notes', authenticateToken, createNote);
router.delete('/:id/notes/:noteId', authenticateToken, deleteNote);

module.exports = router;
