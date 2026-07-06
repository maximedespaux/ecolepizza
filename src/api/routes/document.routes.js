const express = require('express');
const {
    listDocuments, createDocument, getDocument, sendDocument, signDocument, deleteDocument,
} = require('../controllers/document.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, listDocuments);
router.post('/', authenticateToken, createDocument);
router.get('/:id', authenticateToken, getDocument);
router.post('/:id/send', authenticateToken, sendDocument);
router.post('/:id/sign', authenticateToken, signDocument);
router.delete('/:id', authenticateToken, deleteDocument);

module.exports = router;
