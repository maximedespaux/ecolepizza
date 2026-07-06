const express = require('express');
const { userAuthentification, getCurrentUser, logout } = require('../controllers/auth.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.post('/', userAuthentification);
router.get('/me', authenticateToken, getCurrentUser);
router.post('/logout', authenticateToken, logout);

module.exports = router;
