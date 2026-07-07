const express = require('express');
const {
    getInvoices, createInvoice, updateInvoice, recordPayment, deleteInvoice,
    getInvoiceXml, getInvoiceFacturX,
} = require('../controllers/invoice.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getInvoices);
router.post('/', authenticateToken, createInvoice);
router.get('/:id/xml', authenticateToken, getInvoiceXml);
router.get('/:id/facturx', authenticateToken, getInvoiceFacturX);
router.patch('/:id', authenticateToken, updateInvoice);
router.post('/:id/payments', authenticateToken, recordPayment);
router.delete('/:id', authenticateToken, deleteInvoice);

module.exports = router;
