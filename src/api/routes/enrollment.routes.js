const express = require('express');
const {
    getEnrollments, createEnrollment, updateEnrollment, deleteEnrollment,
} = require('../controllers/enrollment.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getEnrollments);
router.post('/', authenticateToken, createEnrollment);
router.patch('/:id', authenticateToken, updateEnrollment);
router.delete('/:id', authenticateToken, deleteEnrollment);

module.exports = router;
