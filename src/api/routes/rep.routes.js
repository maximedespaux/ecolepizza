const express = require('express');
const { getRepDocuments, previewRepDocument, signRepDocument } = require('../controllers/rep.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles('REPRESENTANT'));

router.get('/documents', getRepDocuments);
router.get('/documents/:id/preview', previewRepDocument);
router.post('/documents/:id/sign', signRepDocument);

module.exports = router;
