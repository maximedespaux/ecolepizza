const express = require('express');
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/user.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// La gestion des comptes utilisateurs est réservée à l'administration :
// uniquement SUPER_ADMIN et ADMIN_ORGANISME (le SECRÉTARIAT en est exclu).
router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME'));

router.get('/all', getUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
