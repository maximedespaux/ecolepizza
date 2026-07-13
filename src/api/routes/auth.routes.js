const express = require('express');
const { userAuthentification, getCurrentUser, changePassword, changeEmail, logout } = require('../controllers/auth.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { rateLimit } = require('../middlewares/rateLimit.js');

const router = express.Router();

// Anti-force brute : 10 tentatives / minute / IP sur la connexion.
const loginLimiter = rateLimit({ windowMs: 60000, max: 10, key: 'login' });
// Anti-force brute sur le changement de mot de passe (vérifie le mot de passe actuel).
const passwordLimiter = rateLimit({ windowMs: 60000, max: 10, key: 'pwd' });

router.post('/', loginLimiter, userAuthentification);
router.get('/me', authenticateToken, getCurrentUser);
router.patch('/password', authenticateToken, passwordLimiter, changePassword);
router.patch('/email', authenticateToken, passwordLimiter, changeEmail);
router.post('/logout', authenticateToken, logout);

module.exports = router;
