const express = require('express');
const { getSales, createSale, deleteSale, checkout, getShopSettings, saveShopSettings } = require('../controllers/sale.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', authenticateToken, getSales);
router.get('/settings', authenticateToken, getShopSettings);
router.put('/settings', authenticateToken, saveShopSettings);
router.post('/', authenticateToken, createSale);
router.post('/checkout', authenticateToken, checkout);
router.delete('/:id', authenticateToken, deleteSale);

module.exports = router;
