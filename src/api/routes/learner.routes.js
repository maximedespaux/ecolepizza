const express = require('express');
const {
    getLearners, getLearner, createLearner, updateLearner, deleteLearner, resetStagiairePassword,
} = require('../controllers/learner.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', authenticateToken, getLearners);
router.get('/:id', authenticateToken, getLearner);
router.post('/', authenticateToken, createLearner);
router.post('/:id/reset-password', authenticateToken, resetStagiairePassword);
router.patch('/:id', authenticateToken, updateLearner);
router.delete('/:id', authenticateToken, deleteLearner);

module.exports = router;
