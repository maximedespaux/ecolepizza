const express = require('express');
const { getOrganization, updateOrganization } = require('../controllers/organization.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getOrganization);
router.patch('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'), updateOrganization);

module.exports = router;
