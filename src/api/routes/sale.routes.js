const express = require('express');
const { getSales, createSale, deleteSale, checkout } = require('../controllers/sale.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getSales);
router.post('/', authenticateToken, createSale);
router.post('/checkout', authenticateToken, checkout);
router.delete('/:id', authenticateToken, deleteSale);

module.exports = router;
