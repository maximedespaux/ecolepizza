const express = require('express');
const { getBadges } = require('../controllers/badges.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getBadges);

module.exports = router;
