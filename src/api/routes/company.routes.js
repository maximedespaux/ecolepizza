const express = require('express');
const { getCompanies, getCompany, createCompany, updateCompany, registerCompanyStagiaires } = require('../controllers/company.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', getCompanies);
router.get('/:id', getCompany);
router.post('/', authorizeRoles(...ADMIN_ROLES), createCompany);
router.put('/:id', authorizeRoles(...ADMIN_ROLES), updateCompany);
router.post('/:id/register', authorizeRoles(...ADMIN_ROLES), registerCompanyStagiaires);

module.exports = router;
