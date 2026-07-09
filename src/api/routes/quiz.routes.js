const express = require('express');
const {
    listQuizzes, getQuiz, createQuiz, saveQuiz, deleteQuiz, takeQuiz, submitQuiz, sendQuiz, sendQuizToEnrollment,
} = require('../controllers/quiz.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Passage par le stagiaire (ou le staff) — la vérification d'accès est dans le handler.
router.get('/take/:documentId', takeQuiz);
router.post('/take/:documentId/submit', submitQuiz);

// Administration.
router.get('/', authorizeRoles(...STAFF_ROLES), listQuizzes);
router.post('/', authorizeRoles(...ADMIN_ROLES), createQuiz);
router.post('/:id/send', authorizeRoles(...ADMIN_ROLES), sendQuiz);
router.post('/:id/send/:enrollmentId', authorizeRoles(...ADMIN_ROLES), sendQuizToEnrollment);
router.get('/:id', authorizeRoles(...STAFF_ROLES), getQuiz);
router.put('/:id', authorizeRoles(...ADMIN_ROLES), saveQuiz);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteQuiz);

module.exports = router;
