const express = require('express');
const { getPartners, createPartner, updatePartner, deletePartner } = require('../controllers/partner.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Consultation : tout le personnel (dont le formateur, pour le suivi).
router.get('/', authorizeRoles(...STAFF_ROLES), getPartners);
// Gestion : bureau uniquement.
router.post('/', authorizeRoles(...ADMIN_ROLES), createPartner);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updatePartner);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deletePartner);

module.exports = router;
