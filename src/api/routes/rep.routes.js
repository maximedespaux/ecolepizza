const express = require('express');
const { getRepDocuments, previewRepDocument, signRepDocument, setRepStamp, downloadRepDocument } = require('../controllers/rep.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { remisesDeLEntreprise } = require('../controllers/remise.controller.js');

// Accès RÉSERVÉ par les DONNÉES (pas par le rôle) : chaque handler ne renvoie que les
// documents des entreprises rattachées au compte connecté (company.user_id = user).
// Ainsi un stagiaire qui est AUSSI représentant d'entreprise y a accès sans changer de rôle.
const router = express.Router();
router.use(authenticateToken);

router.get('/documents', getRepDocuments);
router.get('/documents/:id/preview', previewRepDocument);
router.get('/documents/:id/pdf', downloadRepDocument);
router.post('/documents/:id/sign', signRepDocument);
router.put('/stamp', setRepStamp);
// Documents REMIS à l'entreprise (migration 188) : elle en accuse réception par /api/remises/:id/accuser.
router.get('/remises', remisesDeLEntreprise);

module.exports = router;
