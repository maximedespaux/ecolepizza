const express = require('express');
const { searchCatalog, listMine, listShared, getRecipe, createRecipe, updateRecipe, deleteRecipe } = require('../controllers/recipe.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/catalog', authenticateToken, searchCatalog);
router.get('/mine', authenticateToken, listMine);
router.get('/shared', authenticateToken, listShared);
router.get('/:id', authenticateToken, getRecipe);
router.post('/', authenticateToken, createRecipe);
router.put('/:id', authenticateToken, updateRecipe);
router.delete('/:id', authenticateToken, deleteRecipe);

module.exports = router;
