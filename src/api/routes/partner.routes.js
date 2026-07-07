const express = require('express');
const { getPartners, createPartner } = require('../controllers/partner.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getPartners);
router.post('/', authenticateToken, createPartner);

module.exports = router;
