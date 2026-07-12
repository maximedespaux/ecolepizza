const express = require('express');
const {
    getMercuriale, createStore, deleteStore, createItem, updateItem, deleteItem, setPrice,
} = require('../controllers/mercuriale.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Mercuriale : réservée au bureau (données commerciales / tarifs fournisseurs).
router.get('/', authorizeRoles(...ADMIN_ROLES), getMercuriale);
router.post('/stores', authorizeRoles(...ADMIN_ROLES), createStore);
router.delete('/stores/:id', authorizeRoles(...ADMIN_ROLES), deleteStore);
router.post('/items', authorizeRoles(...ADMIN_ROLES), createItem);
router.patch('/items/:id', authorizeRoles(...ADMIN_ROLES), updateItem);
router.delete('/items/:id', authorizeRoles(...ADMIN_ROLES), deleteItem);
router.put('/items/:id/prices/:storeId', authorizeRoles(...ADMIN_ROLES), setPrice);

module.exports = router;
