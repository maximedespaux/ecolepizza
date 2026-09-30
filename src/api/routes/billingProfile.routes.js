const express = require('express');
const { list, create, update, setDefault, reprendreNumerotation, remove } = require('../controllers/billingProfile.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Lecture (sélecteur d'émetteur à la vente / création facture) : tout le personnel.
router.get('/', authorizeRoles(...STAFF_ROLES), list);
// Écriture (identité de facturation) : bureau.
router.post('/', authorizeRoles(...ADMIN_ROLES), create);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), update);
router.put('/:id/defaut', authorizeRoles(...ADMIN_ROLES), setDefault);
// Reprendre la numérotation juste après le dernier document existant.
router.put('/:id/compteur', authorizeRoles(...ADMIN_ROLES), reprendreNumerotation);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), remove);

module.exports = router;
