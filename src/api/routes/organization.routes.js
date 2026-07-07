const express = require('express');
const { getOrganization, updateOrganization } = require('../controllers/organization.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getOrganization);
router.patch('/', authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'), updateOrganization);

module.exports = router;
