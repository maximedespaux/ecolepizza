const express = require('express');
const {
    getItems, createItem, adjustItem, updateItem, sellItem, deleteItem,
} = require('../controllers/inventory.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getItems);
router.post('/', authenticateToken, createItem);
router.patch('/:id/adjust', authenticateToken, adjustItem);
router.post('/:id/sell', authenticateToken, sellItem);
router.patch('/:id', authenticateToken, updateItem);
router.delete('/:id', authenticateToken, deleteItem);

module.exports = router;
