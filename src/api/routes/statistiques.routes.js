const express = require('express');
const { connexions } = require('../controllers/statistiques.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

/* Qualité & conformité : même lecture que le Suivi et le Journal d'audit (bureau + auditeur). */
router.get('/connexions', authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'AUDITEUR'), connexions);

module.exports = router;
