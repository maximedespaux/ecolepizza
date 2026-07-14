const express = require('express');
const { getRepDocuments, previewRepDocument, signRepDocument } = require('../controllers/rep.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

// Accès RÉSERVÉ par les DONNÉES (pas par le rôle) : chaque handler ne renvoie que les
// documents des entreprises rattachées au compte connecté (company.user_id = user).
// Ainsi un stagiaire qui est AUSSI représentant d'entreprise y a accès sans changer de rôle.
const router = express.Router();
router.use(authenticateToken);

router.get('/documents', getRepDocuments);
router.get('/documents/:id/preview', previewRepDocument);
router.post('/documents/:id/sign', signRepDocument);

module.exports = router;
