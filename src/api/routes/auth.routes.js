const express = require('express');
const { userAuthentification, getCurrentUser, changePassword, logout } = require('../controllers/auth.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { rateLimit } = require('../middlewares/rateLimit.js');

const router = express.Router();

// Anti-force brute : 10 tentatives / minute / IP sur la connexion.
const loginLimiter = rateLimit({ windowMs: 60000, max: 10, key: 'login' });

router.post('/', loginLimiter, userAuthentification);
router.get('/me', authenticateToken, getCurrentUser);
router.patch('/password', authenticateToken, changePassword);
router.post('/logout', authenticateToken, logout);

module.exports = router;
