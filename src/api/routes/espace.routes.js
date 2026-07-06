const express = require('express');
const { getMonEspace, getMyFormations, getMyFormation } = require('../controllers/espace.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getMonEspace);
router.get('/formations', authenticateToken, getMyFormations);
router.get('/formations/:id', authenticateToken, getMyFormation);

module.exports = router;
