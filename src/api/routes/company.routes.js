const express = require('express');
const { getCompanies, getCompany, createCompany, updateCompany, deleteCompany, registerCompanyStagiaires, detachLearner, companyDocTemplates, listCompanyDocuments, createCompanyDocument, getCompanyParcours, generateGroupDocuments, getCompanyLearnerDocuments, createRepresentativeAccount } = require('../controllers/company.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', getCompanies);
router.get('/:id', getCompany);
router.get('/:id/doc-templates', companyDocTemplates);
router.get('/:id/documents', listCompanyDocuments);
router.get('/:id/parcours', getCompanyParcours);
router.get('/:id/learner-documents', getCompanyLearnerDocuments);
router.post('/', authorizeRoles(...ADMIN_ROLES), createCompany);
router.put('/:id', authorizeRoles(...ADMIN_ROLES), updateCompany);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteCompany);
router.post('/:id/register', authorizeRoles(...ADMIN_ROLES), registerCompanyStagiaires);
router.post('/:id/representative-account', authorizeRoles(...ADMIN_ROLES), createRepresentativeAccount);
router.delete('/:id/learners/:learnerId', authorizeRoles(...ADMIN_ROLES), detachLearner);
router.post('/:id/documents', authorizeRoles(...ADMIN_ROLES), createCompanyDocument);
router.post('/:id/group-documents', authorizeRoles(...ADMIN_ROLES), generateGroupDocuments);

module.exports = router;
