const express = require('express');
const {
    listQuizzes, getQuiz, createQuiz, saveQuiz, duplicateQuiz, deleteQuiz, takeQuiz, submitQuiz, sendQuiz, sendQuizToEnrollment,
    resultatsOverview, resultatsDetail, deleteResponse,
} = require('../controllers/quiz.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES, AUDIT_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Passage par le stagiaire (ou le staff) — la vérification d'accès est dans le handler.
router.get('/take/:documentId', takeQuiz);
router.post('/take/:documentId/submit', submitQuiz);

// Administration.
router.get('/', authorizeRoles(...STAFF_ROLES), listQuizzes);
// Résultats QCM (Qualité & conformité) — DÉCLARÉS AVANT /:id, sinon « resultats » serait pris
// pour un identifiant de QCM. AUDIT_ROLES : même accès que le reste du groupe Qualité.
router.get('/resultats', authorizeRoles(...AUDIT_ROLES), resultatsOverview);
router.get('/resultats/:id', authorizeRoles(...AUDIT_ROLES), resultatsDetail);
// Supprimer une réponse de stagiaire : bureau uniquement (l'auditeur reste en lecture seule).
router.delete('/reponse/:id', authorizeRoles(...ADMIN_ROLES), deleteResponse);
router.post('/', authorizeRoles(...ADMIN_ROLES), createQuiz);
router.post('/:id/duplicate', authorizeRoles(...ADMIN_ROLES), duplicateQuiz);
router.post('/:id/send', authorizeRoles(...ADMIN_ROLES), sendQuiz);
router.post('/:id/send/:enrollmentId', authorizeRoles(...ADMIN_ROLES), sendQuizToEnrollment);
router.get('/:id', authorizeRoles(...STAFF_ROLES), getQuiz);
router.put('/:id', authorizeRoles(...ADMIN_ROLES), saveQuiz);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteQuiz);

module.exports = router;
