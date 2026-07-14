const express = require('express');
const { getCompanies, getCompany, createCompany, updateCompany, deleteCompany, registerCompanyStagiaires, detachLearner, companyDocTemplates, listCompanyDocuments, createCompanyDocument, getCompanyParcours } = require('../controllers/company.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', getCompanies);
router.get('/:id', getCompany);
router.get('/:id/doc-templates', companyDocTemplates);
router.get('/:id/documents', listCompanyDocuments);
router.get('/:id/parcours', getCompanyParcours);
router.post('/', authorizeRoles(...ADMIN_ROLES), createCompany);
router.put('/:id', authorizeRoles(...ADMIN_ROLES), updateCompany);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteCompany);
router.post('/:id/register', authorizeRoles(...ADMIN_ROLES), registerCompanyStagiaires);
router.delete('/:id/learners/:learnerId', authorizeRoles(...ADMIN_ROLES), detachLearner);
router.post('/:id/documents', authorizeRoles(...ADMIN_ROLES), createCompanyDocument);

module.exports = router;
