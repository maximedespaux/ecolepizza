const express = require('express');
const { getOpcos, createOpco, updateOpco, deleteOpco } = require('../controllers/opco.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Lecture (pour les listes déroulantes) : tout le personnel.
router.get('/', authorizeRoles(...STAFF_ROLES), getOpcos);
// Écriture : bureau.
router.post('/', authorizeRoles(...ADMIN_ROLES), createOpco);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updateOpco);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteOpco);

module.exports = router;
