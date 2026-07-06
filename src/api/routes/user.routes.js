const express = require('express');
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/user.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/all', authenticateToken, getUsers);
router.post('/', createUser);
router.patch('/:id', authenticateToken, updateUser);
router.delete('/:id', authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME'), deleteUser);

module.exports = router;
