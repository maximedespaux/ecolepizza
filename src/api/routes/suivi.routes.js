const express = require('express');
const multer = require('multer');
const { getSuivi, getArchive, importArchive, getArchiveFile, deleteArchive, bulkDeleteArchive,
    getArchiveStockage } = require('../controllers/suivi.controller.js');
const { authenticateToken, authorizeRoles, AUDIT_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

/* PDF en mémoire (stockés ensuite en base). Import par lots : un dossier entier peut porter des
   milliers de fichiers, et c'est le cas d'usage — on ne touche donc PAS au nombre.
   10 Mo PAR FICHIER et non 25 : ce sont des PDF de documents administratifs ; le coffre entier
   pèse 681 Mo pour plus d'un millier de pièces, soit moins d'un mégaoctet chacune. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 3000 } });

/**
 * PLAFOND SUR LA REQUÊTE ENTIÈRE, avant que `multer` ne commence à remplir la mémoire.
 *
 * `multer` borne chaque fichier et leur NOMBRE, jamais leur SOMME : 3000 × 10 Mo tiendraient
 * dans les limites déclarées et mettraient le serveur à genoux, puisque `memoryStorage` garde
 * tout en RAM. Le contrôle doit donc arriver AVANT lui — une fois le corps lu, la mémoire est
 * déjà prise, et refuser ne la rend pas.
 *
 * `Content-Length` suffit ici : les navigateurs l'envoient toujours sur un `FormData`. Absent
 * (corps en morceaux), on laisse passer et les bornes de `multer` reprennent la main — mieux
 * vaut ça que refuser un import légitime sur un en-tête manquant.
 */
const MAX_LOT_OCTETS = 1024 * 1024 * 1024; // 1 Go : le coffre entier en pèse 681
function limiteDuLot(req, res, next) {
    const annonce = Number(req.headers['content-length'] || 0);
    if (annonce > MAX_LOT_OCTETS) {
        return res.status(413).json({
            message: `Lot trop volumineux (${Math.round(MAX_LOT_OCTETS / 1024 / 1024)} Mo au plus par import). Reprenez en plusieurs fois.`,
        });
    }
    return next();
}

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
router.post('/archives/import', authorizeRoles(...ADMIN_ROLES), limiteDuLot, upload.array('files', 3000), importArchive);
router.post('/archives/delete', authorizeRoles(...ADMIN_ROLES), bulkDeleteArchive); // suppression groupée
router.delete('/archives/:id', authorizeRoles(...ADMIN_ROLES), deleteArchive);

module.exports = router;
