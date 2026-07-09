const express = require('express');
const { getCatalog, getFieldValues, getFields, saveFields, listConditions, createCondition, deleteCondition } = require('../controllers/condition.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Conditions personnalisées : administration de l'organisme uniquement.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/catalog', getCatalog);   // champs activés + opérateurs (sélecteur)
router.get('/field-values', getFieldValues); // valeurs existantes (suggestions)
router.get('/fields', getFields);     // tous les champs éligibles (réglages)
router.put('/fields', saveFields);    // activation + libellés
router.get('/', listConditions);
router.post('/', createCondition);
router.delete('/:id', deleteCondition);

module.exports = router;
