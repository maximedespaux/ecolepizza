const express = require('express');
const { listMine, createItem, updateItem, deleteItem } = require('../controllers/mercuriale.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, listMine);
router.post('/', authenticateToken, createItem);
router.patch('/:id', authenticateToken, updateItem);
router.delete('/:id', authenticateToken, deleteItem);

module.exports = router;
