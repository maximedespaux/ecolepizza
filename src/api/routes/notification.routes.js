const express = require('express');
const { getNotifications, markRead, markAllRead } = require('../controllers/notification.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getNotifications);
router.patch('/:id/read', authenticateToken, markRead);
router.post('/read-all', authenticateToken, markAllRead);

module.exports = router;
