const express = require('express');
const { getMyIntervenantSheets, signMyIntervenantSheet, getMyIntervenantProfile, setMyIntervenantSignature } = require('../controllers/intervenant.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Espace réservé aux comptes INTERVENANT (signature de leurs demi-journées).
router.use(authenticateToken, authorizeRoles('INTERVENANT'));

router.get('/me', getMyIntervenantProfile);
router.put('/signature', setMyIntervenantSignature);
router.get('/emargement', getMyIntervenantSheets);
router.post('/emargement/sign', signMyIntervenantSheet);

module.exports = router;
