const express = require('express');
const { getMyIntervenantSheets, signMyIntervenantSheet, getMyIntervenantProfile,
    setMyIntervenantSignature, getMyJuryGrille, noterJury, verdictJury, cloturerJury,
    mesDocuments, signerMonDocument,
} = require('../controllers/intervenant.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Espace réservé aux comptes INTERVENANT (signature de leurs demi-journées).
router.use(authenticateToken, authorizeRoles('INTERVENANT'));

router.get('/me', getMyIntervenantProfile);
router.put('/signature', setMyIntervenantSignature);
/* Documents de session qui LUI sont attribués (contrat d'hygiène…). Il les signe d'un clic
   avec sa signature enregistrée : aucun lien public, aucun jeton par courriel — il a un compte. */
router.get('/documents', mesDocuments);
router.post('/documents/:id/signer', signerMonDocument);

router.get('/emargement', getMyIntervenantSheets);
router.post('/emargement/sign', signMyIntervenantSheet);

/* Évaluation par le jury. Chaque route revérifie l'AFFECTATION à la session avant de déléguer
   aux contrôleurs d'évaluation, qui portent le barème et les gardes. */
router.get('/evaluation/:id', getMyJuryGrille);
router.put('/evaluation/note', noterJury);
router.put('/evaluation/verdict', verdictJury);
router.post('/evaluation/cloturer', cloturerJury);

module.exports = router;
