const express = require('express');
const { getAudit } = require('../controllers/audit.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'AUDITEUR'), getAudit);

module.exports = router;
