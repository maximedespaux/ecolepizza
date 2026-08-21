const express = require('express');
const { listTeam, createMember, updateMember, deleteMember } = require('../controllers/equipe.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Gestion de l'équipe réservée au propriétaire et aux administrateurs.
router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME'));

router.get('/', listTeam);
router.post('/', createMember);
router.patch('/:id', updateMember);
router.delete('/:id', deleteMember);

module.exports = router;
