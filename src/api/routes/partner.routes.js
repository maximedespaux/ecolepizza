const express = require('express');
const { getPartners, createPartner, updatePartner, deletePartner, createContribution, deleteContribution } = require('../controllers/partner.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Consultation : tout le personnel (dont le formateur, pour le suivi).
router.get('/', authorizeRoles(...STAFF_ROLES), getPartners);

// Contributions en nature : saisie par tout le personnel (dont formateur) ; suppression bureau.
router.post('/contributions', authorizeRoles(...STAFF_ROLES), createContribution);
router.delete('/contributions/:id', authorizeRoles(...ADMIN_ROLES), deleteContribution);

// Gestion des partenaires : bureau uniquement.
router.post('/', authorizeRoles(...ADMIN_ROLES), createPartner);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updatePartner);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deletePartner);

module.exports = router;
