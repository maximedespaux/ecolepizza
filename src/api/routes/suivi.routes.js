const express = require('express');
const { getSuivi } = require('../controllers/suivi.controller.js');
const { authenticateToken, authorizeRoles, AUDIT_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...AUDIT_ROLES));

router.get('/', authenticateToken, getSuivi);

module.exports = router;
