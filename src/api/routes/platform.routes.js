const express = require('express');
const { listOrganizations, createOrganization } = require('../controllers/platform.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Administration plateforme : réservée au propriétaire de plateforme (au-dessus des organismes).
router.use(authenticateToken, authorizeRoles('PLATFORM_OWNER'));

router.get('/organizations', listOrganizations);
router.post('/organizations', createOrganization);

module.exports = router;
