const express = require('express');
const multer = require('multer');
const { savePhoto, getPhoto, deletePhoto } = require('../controllers/photoFiche.controller.js');
const { markRecipeRead, searchCatalog, catalogFamilies, catalogBrands, listMine, listShared, listComponents, getRecipe, createRecipe, updateRecipe, deleteRecipe, unshareRecipe, authorProfile, toggleLike, addComment, updateComment, deleteComment } = require('../controllers/recipe.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();
/* La photo d'une fiche arrive DÉJÀ réduite par le navigateur (lib/image.js, profil `fiche`) ;
   `multer` la garde EN MÉMOIRE, elle part en base. Sa limite est au-dessus de celle du contrôleur
   (MAX_PHOTO_FICHE, lib/photoFiche.js) : c'est lui qui répond un 413 lisible, plutôt qu'une erreur
   brute de multer. */
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 400 * 1024, files: 1 } });

router.get('/catalog/families', authenticateToken, catalogFamilies);
router.get('/catalog/brands', authenticateToken, catalogBrands);
router.get('/catalog', authenticateToken, searchCatalog);
router.get('/mine', authenticateToken, listMine);
router.get('/shared', authenticateToken, listShared);
router.get('/components', authenticateToken, listComponents);
router.get('/author/:userId', authenticateToken, authorProfile);
router.get('/:id', authenticateToken, getRecipe);
router.post('/', authenticateToken, createRecipe);
router.put('/:id', authenticateToken, updateRecipe);
router.delete('/:id', authenticateToken, deleteRecipe);
// Dépublier n'est PAS supprimer : route à part, pour que la modération ne puisse que
// retirer du fil — jamais toucher au contenu d'une fiche qui n'est pas la sienne.
router.post('/:id/retirer', authenticateToken, unshareRecipe);
// La photo de la fiche (migration 191) : servie à qui peut ouvrir la fiche, posée par son auteur.
router.get('/:id/photo', authenticateToken, getPhoto);
router.put('/:id/photo', authenticateToken, photoUpload.single('photo'), savePhoto);
router.delete('/:id/photo', authenticateToken, deletePhoto);
// Marque la fiche lue : eteint son halo « nouveaux commentaires ».
router.post('/:id/read', authenticateToken, markRecipeRead);
router.post('/:id/like', authenticateToken, toggleLike);
router.post('/:id/comments', authenticateToken, addComment);
router.put('/:id/comments/:cid', authenticateToken, updateComment);
router.delete('/:id/comments/:cid', authenticateToken, deleteComment);

module.exports = router;
