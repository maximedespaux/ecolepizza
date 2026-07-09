const express = require('express');
const { listProfiles, createProfile, updateProfile, deleteProfile, upsertSystemRole } = require('../controllers/accessProfile.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Rôles d'accès : super administrateur + administrateur d'organisme.
router.use(authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME'));

router.get('/', listProfiles);
router.post('/', createProfile);
router.put('/system/:role', upsertSystemRole); // avant /:id
router.patch('/:id', updateProfile);
router.delete('/:id', deleteProfile);

module.exports = router;
