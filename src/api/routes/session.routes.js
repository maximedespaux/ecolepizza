const express = require('express');
const { getSessions, getSession, createSession, deleteSession } = require('../controllers/session.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getSessions);
router.get('/:id', authenticateToken, getSession);
router.post('/', authenticateToken, createSession);
router.delete('/:id', authenticateToken, deleteSession);

module.exports = router;
