const express = require('express');
const { getCompanies, getCompany, createCompany, updateCompany, registerCompanyStagiaires, companyDocTemplates, listCompanyDocuments, createCompanyDocument } = require('../controllers/company.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', getCompanies);
router.get('/:id', getCompany);
router.get('/:id/doc-templates', companyDocTemplates);
router.get('/:id/documents', listCompanyDocuments);
router.post('/', authorizeRoles(...ADMIN_ROLES), createCompany);
router.put('/:id', authorizeRoles(...ADMIN_ROLES), updateCompany);
router.post('/:id/register', authorizeRoles(...ADMIN_ROLES), registerCompanyStagiaires);
router.post('/:id/documents', authorizeRoles(...ADMIN_ROLES), createCompanyDocument);

module.exports = router;
