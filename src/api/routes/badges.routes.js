const express = require('express');
const { getBadges } = require('../controllers/badges.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getBadges);

module.exports = router;
