const express = require('express');
const multer = require('multer');
const { getSuivi, getArchive, importArchive, getArchiveFile, deleteArchive, bulkDeleteArchive,
    getArchiveStockage } = require('../controllers/suivi.controller.js');
const { authenticateToken, authorizeRoles, AUDIT_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

// PDF en mémoire (stockés ensuite en base). 25 Mo / fichier, import par lots.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 3000 } });

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...AUDIT_ROLES));

router.get('/', getSuivi);
router.get('/archives', getArchive);
/* AVANT `/archives/:id/file` ? Non : deux segments contre trois, aucun conflit. Mais ADMIN
 * uniquement, et pour une raison de coût autant que de droit — la requête lit les 681 Mo de
 * blobs pour en calculer les empreintes. Ce n'est pas une consultation, c'est un inventaire. */
router.get('/archives/stockage', authorizeRoles(...ADMIN_ROLES), getArchiveStockage);
router.get('/archives/:id/file', getArchiveFile);
// Import / suppression : administration uniquement.
router.post('/archives/import', authorizeRoles(...ADMIN_ROLES), upload.array('files', 3000), importArchive);
router.post('/archives/delete', authorizeRoles(...ADMIN_ROLES), bulkDeleteArchive); // suppression groupée
router.delete('/archives/:id', authorizeRoles(...ADMIN_ROLES), deleteArchive);

module.exports = router;
