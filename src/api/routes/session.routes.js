const express = require('express');
const { getSessions, getSession, createSession, deleteSession, getSessionBoard, listTrainers, setSessionTrainers } = require('../controllers/session.controller.js');
const { listSessionIntervenants, addSessionIntervenant, setIntervenantSlots, removeSessionIntervenant } = require('../controllers/intervenant.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Lecture : tout le personnel (le formateur consulte ses sessions pour l'émargement).
router.get('/', authorizeRoles(...STAFF_ROLES), getSessions);
router.get('/trainers', authorizeRoles(...STAFF_ROLES), listTrainers); // avant /:id
router.get('/:id', authorizeRoles(...STAFF_ROLES), getSession);
router.get('/:id/board', authorizeRoles(...STAFF_ROLES), getSessionBoard);
router.get('/:id/intervenants', authorizeRoles(...STAFF_ROLES), listSessionIntervenants);
// Écriture : bureau uniquement (pas le formateur).
router.post('/', authorizeRoles(...ADMIN_ROLES), createSession);
router.put('/:id/trainers', authorizeRoles(...ADMIN_ROLES), setSessionTrainers);
router.post('/:id/intervenants', authorizeRoles(...ADMIN_ROLES), addSessionIntervenant);
router.put('/:id/intervenants/:siId/slots', authorizeRoles(...ADMIN_ROLES), setIntervenantSlots);
router.delete('/:id/intervenants/:siId', authorizeRoles(...ADMIN_ROLES), removeSessionIntervenant);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteSession);

module.exports = router;
