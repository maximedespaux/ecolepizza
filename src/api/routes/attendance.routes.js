const express = require('express');
const { getAttendance, generateSheets, rattraperPresence, resignPresence, signSheet, regenerateEmargement } = require('../controllers/attendance.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/:sessionId', authenticateToken, getAttendance);
router.post('/:sessionId/generate', authenticateToken, generateSheets);
router.post('/record/:id/rattrapage', authenticateToken, rattraperPresence);
router.post('/record/:id/resign', authenticateToken, resignPresence);
router.post('/sheet/:id/sign', authenticateToken, signSheet);
router.post('/:sessionId/regenerate', authenticateToken, regenerateEmargement);

module.exports = router;
