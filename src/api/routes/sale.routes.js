const express = require('express');
const { getSales, createSale, deleteSale, checkout } = require('../controllers/sale.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getSales);
router.post('/', authenticateToken, createSale);
router.post('/checkout', authenticateToken, checkout);
router.delete('/:id', authenticateToken, deleteSale);

module.exports = router;
