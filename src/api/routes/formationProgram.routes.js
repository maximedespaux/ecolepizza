const express = require('express');
const { getPrograms, getProgram, createProgram } = require('../controllers/formationProgram.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getPrograms);
router.get('/:id', authenticateToken, getProgram);
router.post('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'), createProgram);

module.exports = router;
