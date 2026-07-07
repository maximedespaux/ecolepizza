const express = require('express');
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/user.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Toutes les routes utilisateur sont réservées à l'administration (correctif : POST /user était public).
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/all', getUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.delete('/:id', authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME'), deleteUser);

module.exports = router;
