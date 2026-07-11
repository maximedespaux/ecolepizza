const express = require('express');
const { getOrganization, updateOrganization, getLocations, saveLocations } = require('../controllers/organization.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

const ADMIN = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'];
router.get('/', authenticateToken, getOrganization);
router.patch('/', authenticateToken, authorizeRoles(...ADMIN), updateOrganization);
router.get('/locations', getLocations);
router.put('/locations', authenticateToken, authorizeRoles(...ADMIN), saveLocations);

module.exports = router;
