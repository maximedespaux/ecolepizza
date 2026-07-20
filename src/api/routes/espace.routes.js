const express = require('express');
const multer = require('multer');
// Union des deux branches : getMyAccess + le bloc boutique/avatar. `multer` reste (upload avatar).
const { getMonEspace, getMyAccess, getMyFormations, getMyFormation, getMyEmargement, signMyEmargement, getMyProfile, saveMyAvatar, saveMyAvatarImage, getAvatarImage, deleteMyAvatarImage, saveMyQuest, getMyInfos, updateMyInfos, updateMyVisibility, getBoutique, getBoutiquePartenaires, createShopRequest, getMyShopRequests, cancelMyShopRequest, getPickupSlots } = require('../controllers/espace.controller.js');
const { getPlayableChapters } = require('../controllers/questContent.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Photo de profil : le navigateur envoie un carré 500x500 déjà recadré et compressé.
// 400 Ko en garde-fou multer (le contrôleur, lui, refuse au-delà de 300 Ko) : ça arrête un
// envoi manifestement hors process avant même de charger le corps en mémoire.
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 400 * 1024, files: 1 } });

router.get('/', authenticateToken, getMonEspace);
router.get('/access', authenticateToken, getMyAccess);
router.get('/formations', authenticateToken, getMyFormations);
router.get('/formations/:id', authenticateToken, getMyFormation);
// Chapitres jouables de Pizza Quest pour une formation (banque de l'organisme).
// Réponse vide = rien d'importé : le jeu retombe sur sa banque codée en dur.
router.get('/quest/:programId/chapitres', authenticateToken, getPlayableChapters);
router.get('/emargement', authenticateToken, getMyEmargement);
router.post('/emargement/:recordId/sign', authenticateToken, signMyEmargement);
router.get('/profile', authenticateToken, getMyProfile);
router.get('/infos', authenticateToken, getMyInfos);
router.put('/infos', authenticateToken, updateMyInfos);
router.put('/visibility', authenticateToken, updateMyVisibility);
router.put('/avatar', authenticateToken, saveMyAvatar);
router.post('/avatar-image', authenticateToken, avatarUpload.single('image'), saveMyAvatarImage);
router.get('/avatar-image/:learnerId', authenticateToken, getAvatarImage);
router.delete('/avatar-image', authenticateToken, deleteMyAvatarImage);
router.get('/boutique', authenticateToken, getBoutique);
router.get('/boutique/partenaires', authenticateToken, getBoutiquePartenaires);
router.get('/boutique/creneaux', authenticateToken, getPickupSlots);
router.post('/boutique/demande', authenticateToken, createShopRequest);
router.get('/boutique/mes-demandes', authenticateToken, getMyShopRequests);
// Annulation par le stagiaire — possible tant que la demande est « Reçue » (contrôlé dans le WHERE).
router.put('/boutique/demande/:id/annuler', authenticateToken, cancelMyShopRequest);
router.put('/quest', authenticateToken, saveMyQuest);

module.exports = router;
