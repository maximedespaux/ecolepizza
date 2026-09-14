const express = require('express');
const { getMyIntervenantSheets, signMyIntervenantSheet, getMyIntervenantProfile, setMyIntervenantSignature, getMyJuryGrille, noterJury, verdictJury } = require('../controllers/intervenant.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Espace réservé aux comptes INTERVENANT (signature de leurs demi-journées).
router.use(authenticateToken, authorizeRoles('INTERVENANT'));

router.get('/me', getMyIntervenantProfile);
router.put('/signature', setMyIntervenantSignature);
router.get('/emargement', getMyIntervenantSheets);
router.post('/emargement/sign', signMyIntervenantSheet);

/* Évaluation par le jury. Chaque route revérifie l'AFFECTATION à la session avant de déléguer
   aux contrôleurs d'évaluation, qui portent le barème et les gardes. */
router.get('/evaluation/:id', getMyJuryGrille);
router.put('/evaluation/note', noterJury);
router.put('/evaluation/verdict', verdictJury);

module.exports = router;
