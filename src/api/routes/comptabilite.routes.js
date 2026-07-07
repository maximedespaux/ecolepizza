const express = require('express');
const {
    getGestion, getPerformance, createExpense, deleteExpense,
    listRevenues, createRevenue, deleteRevenue, saveTargets,
} = require('../controllers/comptabilite.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Tableau de gestion complet (CA, dépenses, dividendes) : administration seulement.
router.get('/', authorizeRoles(...ADMIN_ROLES), getGestion);
router.get('/performance', authorizeRoles(...ADMIN_ROLES), getPerformance);
router.post('/depenses', authorizeRoles(...ADMIN_ROLES), createExpense);
router.delete('/depenses/:id', authorizeRoles(...ADMIN_ROLES), deleteExpense);
router.put('/cibles', authorizeRoles(...ADMIN_ROLES), saveTargets);

// Produits divers : le formateur peut en enregistrer et consulter les siens.
router.get('/revenus', authorizeRoles(...STAFF_ROLES), listRevenues);
router.post('/revenus', authorizeRoles(...STAFF_ROLES), createRevenue);
router.delete('/revenus/:id', authorizeRoles(...STAFF_ROLES), deleteRevenue);

module.exports = router;
