const express = require('express');
const { getCompanies, createCompany } = require('../controllers/company.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getCompanies);
router.post('/', authenticateToken, createCompany);

module.exports = router;
