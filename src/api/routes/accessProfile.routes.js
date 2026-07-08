const express = require('express');
const { listProfiles, createProfile, updateProfile, deleteProfile } = require('../controllers/accessProfile.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Rôles d'accès personnalisés : réservés au super administrateur (comme la config d'accès menu).
router.use(authenticateToken, authorizeRoles('SUPER_ADMIN'));

router.get('/', listProfiles);
router.post('/', createProfile);
router.patch('/:id', updateProfile);
router.delete('/:id', deleteProfile);

module.exports = router;
