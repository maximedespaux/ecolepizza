const express = require('express');
const { getMonEspace, getMyFormations, getMyFormation, getMyEmargement, signMyEmargement, getMyProfile, saveMyAvatar, saveMyQuest, getMyInfos, updateMyInfos, updateMyVisibility } = require('../controllers/espace.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getMonEspace);
router.get('/formations', authenticateToken, getMyFormations);
router.get('/formations/:id', authenticateToken, getMyFormation);
router.get('/emargement', authenticateToken, getMyEmargement);
router.post('/emargement/:recordId/sign', authenticateToken, signMyEmargement);
router.get('/profile', authenticateToken, getMyProfile);
router.get('/infos', authenticateToken, getMyInfos);
router.put('/infos', authenticateToken, updateMyInfos);
router.put('/visibility', authenticateToken, updateMyVisibility);
router.put('/avatar', authenticateToken, saveMyAvatar);
router.put('/quest', authenticateToken, saveMyQuest);

module.exports = router;
