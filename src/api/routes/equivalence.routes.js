const express = require('express');
const { listEquivalences, createEquivalence, deleteEquivalence } = require('../controllers/equivalence.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Équivalences de documents : administration de l'organisme uniquement.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', listEquivalences);
router.post('/', createEquivalence);
router.delete('/:id', deleteEquivalence);

module.exports = router;
