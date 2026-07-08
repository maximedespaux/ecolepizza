const express = require('express');
const { getPrograms, getProgram, createProgram, updateProgram, reorderPrograms, getFormationSteps, saveFormationSteps } = require('../controllers/formationProgram.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', getPrograms);
// Création / modification / ordre : bureau uniquement (pas le formateur).
router.put('/reorder', authorizeRoles(...ADMIN_ROLES), reorderPrograms);
router.get('/:id', getProgram);
router.get('/:id/steps', getFormationSteps);
router.put('/:id/steps', authorizeRoles(...ADMIN_ROLES), saveFormationSteps);
router.post('/', authorizeRoles(...ADMIN_ROLES), createProgram);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updateProgram);

module.exports = router;
