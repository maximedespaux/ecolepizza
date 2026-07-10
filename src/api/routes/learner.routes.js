const express = require('express');
const {
    getLearners, getLearner, createLearner, updateLearner, deleteLearner, resetStagiairePassword, deleteStagiaireAccount,
} = require('../controllers/learner.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Lecture : tout le personnel, y compris le formateur (consultation des stagiaires).
router.get('/', authorizeRoles(...STAFF_ROLES), getLearners);
router.get('/:id', authorizeRoles(...STAFF_ROLES), getLearner);
// Écriture / comptes : bureau uniquement (pas le formateur).
router.post('/', authorizeRoles(...ADMIN_ROLES), createLearner);
router.post('/:id/reset-password', authorizeRoles(...ADMIN_ROLES), resetStagiairePassword);
router.delete('/:id/account', authorizeRoles(...ADMIN_ROLES), deleteStagiaireAccount);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updateLearner);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteLearner);

module.exports = router;
