const express = require('express');
const { getPrograms, getProgram, createProgram, updateProgram } = require('../controllers/formationProgram.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', getPrograms);
router.get('/:id', getProgram);
// Création / modification : bureau uniquement (pas le formateur).
router.post('/', authorizeRoles(...ADMIN_ROLES), createProgram);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updateProgram);

module.exports = router;
