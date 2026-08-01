const express = require('express');
const { markRecipeRead, searchCatalog, catalogFamilies, catalogBrands, listMine, listShared, listComponents, getRecipe, createRecipe, updateRecipe, deleteRecipe, unshareRecipe, authorProfile, toggleLike, addComment, updateComment, deleteComment } = require('../controllers/recipe.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

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
// Marque la fiche lue : eteint son halo « nouveaux commentaires ».
router.post('/:id/read', authenticateToken, markRecipeRead);
router.post('/:id/like', authenticateToken, toggleLike);
router.post('/:id/comments', authenticateToken, addComment);
router.put('/:id/comments/:cid', authenticateToken, updateComment);
router.delete('/:id/comments/:cid', authenticateToken, deleteComment);

module.exports = router;
