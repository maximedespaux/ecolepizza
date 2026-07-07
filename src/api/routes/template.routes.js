const express = require('express');
const multer = require('multer');
const {
    listTemplates, saveTemplate, uploadTemplate, downloadTemplate, resetTemplate,
} = require('../controllers/template.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

// Fichier en mémoire (stocké ensuite en base). Limite 20 Mo.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = express.Router();
// Gestion des modèles : administration de l'organisme uniquement.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', listTemplates);
router.get('/:slug/file', downloadTemplate);
router.put('/:slug', saveTemplate);                       // métadonnées (étape)
router.post('/:slug', upload.single('file'), uploadTemplate); // fichier .docx
router.delete('/:slug', resetTemplate);

module.exports = router;
