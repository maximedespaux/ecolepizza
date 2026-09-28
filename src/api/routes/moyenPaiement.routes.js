const express = require('express');
const { lister, creer, modifier, supprimer, ordonner } = require('../controllers/moyenPaiement.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Lecture : tout le personnel — la caisse et la facturation d'une demande proposent ces moyens.
router.get('/', authorizeRoles(...STAFF_ROLES), lister);
// Écriture (Paramètres → Facturation) : le bureau, comme les entités émettrices.
router.post('/', authorizeRoles(...ADMIN_ROLES), creer);
// Avant `/:id` : « ordre » n'est pas un identifiant.
router.put('/ordre', authorizeRoles(...ADMIN_ROLES), ordonner);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), modifier);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), supprimer);

module.exports = router;
