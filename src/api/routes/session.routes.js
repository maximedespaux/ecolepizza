const express = require('express');
const { getSessions, getSession, createSession, deleteSession } = require('../controllers/session.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getSessions);
router.get('/:id', authenticateToken, getSession);
router.post('/', authenticateToken, createSession);
router.delete('/:id', authenticateToken, deleteSession);

module.exports = router;
