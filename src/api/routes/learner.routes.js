const express = require('express');
const {
    getLearners, getDistinctions, getARecontacter, getLearner, createLearner, updateLearner, deleteLearner, resetStagiairePassword, deleteStagiaireAccount, importLearners,
} = require('../controllers/learner.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Lecture : tout le personnel, y compris le formateur (consultation des stagiaires).
router.get('/', authorizeRoles(...STAFF_ROLES), getLearners);
/* AVANT `/:id`, sinon « distinctions » serait pris pour un identifiant de stagiaire. Réservé au
   bureau, comme l'écriture qu'il prépare (PATCH /:id) : le formateur ne décerne pas de cadre. */
router.get('/distinctions', authorizeRoles(...ADMIN_ROLES), getDistinctions);
/* AVANT `/:id` aussi. Le bureau, comme l'écriture qui décoche le rappel (PATCH /:id) : une liste de
   personnes à rappeler n'a de sens que pour qui peut les rappeler — et la décocher. Un accès
   délégué sur la rubrique Stagiaires y donne droit, comme partout ailleurs. */
router.get('/a-recontacter', authorizeRoles(...ADMIN_ROLES), getARecontacter);
router.get('/:id', authorizeRoles(...STAFF_ROLES), getLearner);
// Écriture / comptes : bureau uniquement (pas le formateur).
router.post('/', authorizeRoles(...ADMIN_ROLES), createLearner);
// L'import CSV : mêmes rôles que la création d'une fiche (lib/importFiches.js).
router.post('/import', authorizeRoles(...ADMIN_ROLES), importLearners);
router.post('/:id/reset-password', authorizeRoles(...ADMIN_ROLES), resetStagiairePassword);
router.delete('/:id/account', authorizeRoles(...ADMIN_ROLES), deleteStagiaireAccount);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updateLearner);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteLearner);

module.exports = router;
