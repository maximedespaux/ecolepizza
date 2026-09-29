const express = require('express');
const {
    getInvoices, sessionsAFacturer, createInvoice, updateInvoice, recordPayment, deleteInvoice,
    getInvoiceXml, getInvoiceFacturX,
} = require('../controllers/invoice.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getInvoices);
// Les sessions et leurs stagiaires, pour choisir qui facturer.
router.get('/sessions', authenticateToken, sessionsAFacturer);
router.post('/', authenticateToken, createInvoice);
router.get('/:id/xml', authenticateToken, getInvoiceXml);
router.get('/:id/facturx', authenticateToken, getInvoiceFacturX);
router.patch('/:id', authenticateToken, updateInvoice);
router.post('/:id/payments', authenticateToken, recordPayment);
router.delete('/:id', authenticateToken, deleteInvoice);

module.exports = router;
