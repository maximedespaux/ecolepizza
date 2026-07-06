const express = require('express');
const { getSuivi } = require('../controllers/suivi.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getSuivi);

module.exports = router;
