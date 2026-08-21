const express = require('express');
const { getOrganization, updateOrganization, getLocations, saveLocations,
    getPartnerFields } = require('../controllers/organization.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

const ADMIN = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'];
router.get('/', authenticateToken, getOrganization);
router.patch('/', authenticateToken, authorizeRoles(...ADMIN), updateOrganization);
/* Le CHOIX des informations transmises aux partenaires. Lecture ouverte au personnel (l'écran de
   réglages l'affiche), écriture par `PATCH /` comme le reste de la fiche organisme — donc bureau
   uniquement, puisque ce choix décide de ce qui sort de l'école. */
router.get('/champs-partenaires', getPartnerFields);
router.get('/locations', getLocations);
router.put('/locations', authenticateToken, authorizeRoles(...ADMIN), saveLocations);

module.exports = router;
