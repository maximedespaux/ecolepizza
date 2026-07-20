const express = require('express');
const { listShopRequests, updateShopRequest, invoiceShopRequest, deleteShopRequest, deleteAllShopRequests, listPickups } = require('../controllers/shopRequest.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Zone école : un stagiaire ne voit QUE ses propres demandes, et il les lit via
// /api/mon-espace/boutique/mes-demandes. Ici on voit celles de toute l'organisation, avec les
// coordonnées des demandeurs — donc réservé aux rôles admin.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/demandes', listShopRequests);
router.get('/retraits', listPickups);
router.put('/demandes/:id', updateShopRequest);
router.delete('/demandes', deleteAllShopRequests); // purge totale (avant la route :id)
router.delete('/demandes/:id', deleteShopRequest);
router.post('/demandes/:id/facture', invoiceShopRequest);

module.exports = router;
