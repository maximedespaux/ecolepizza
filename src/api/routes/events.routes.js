const express = require('express');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { stream } = require('../controllers/events.controller.js');

const router = express.Router();

// Flux temps réel (SSE). Authentifié, isolé par organisation dans le contrôleur.
router.get('/', authenticateToken, stream);

module.exports = router;
