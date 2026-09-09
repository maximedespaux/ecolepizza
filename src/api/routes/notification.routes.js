const express = require('express');
const { getNotifications, markRead, markAllRead, deleteNotification } = require('../controllers/notification.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getNotifications);
router.patch('/:id/read', authenticateToken, markRead);
router.post('/read-all', authenticateToken, markAllRead);
/* Pas d'`authorizeRoles` ici : le droit ne se lit pas dans le rôle mais dans la capacité
   accordée par l'organisme, et le contrôleur la relit EN BASE à chaque appel — un rôle mis
   dans le jeton resterait valable jusqu'à sept jours après le retrait du droit. */
router.delete('/:id', authenticateToken, deleteNotification);

module.exports = router;
