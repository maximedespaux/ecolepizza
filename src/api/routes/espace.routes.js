const express = require('express');
const { getMonEspace, getMyFormations, getMyFormation, getMyEmargement, signMyEmargement } = require('../controllers/espace.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getMonEspace);
router.get('/formations', authenticateToken, getMyFormations);
router.get('/formations/:id', authenticateToken, getMyFormation);
router.get('/emargement', authenticateToken, getMyEmargement);
router.post('/emargement/:recordId/sign', authenticateToken, signMyEmargement);

module.exports = router;
