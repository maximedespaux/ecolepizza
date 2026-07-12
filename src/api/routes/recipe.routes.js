const express = require('express');
const { searchCatalog, catalogFamilies, catalogBrands, listMine, listShared, listComponents, getRecipe, createRecipe, updateRecipe, deleteRecipe } = require('../controllers/recipe.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/catalog/families', authenticateToken, catalogFamilies);
router.get('/catalog/brands', authenticateToken, catalogBrands);
router.get('/catalog', authenticateToken, searchCatalog);
router.get('/mine', authenticateToken, listMine);
router.get('/shared', authenticateToken, listShared);
router.get('/components', authenticateToken, listComponents);
router.get('/:id', authenticateToken, getRecipe);
router.post('/', authenticateToken, createRecipe);
router.put('/:id', authenticateToken, updateRecipe);
router.delete('/:id', authenticateToken, deleteRecipe);

module.exports = router;
