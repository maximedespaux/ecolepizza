const express = require('express');
const { getAttendance, generateSheets, setPresence } = require('../controllers/attendance.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/:sessionId', authenticateToken, getAttendance);
router.post('/:sessionId/generate', authenticateToken, generateSheets);
router.patch('/record/:id', authenticateToken, setPresence);

module.exports = router;
