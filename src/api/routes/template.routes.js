const express = require('express');
const multer = require('multer');
const {
    listTemplates, saveTemplate, uploadTemplate, downloadTemplate, resetTemplate,
    getTokens, getTemplateBody,
} = require('../controllers/template.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

// Fichier en mémoire (stocké ensuite en base). Limite 20 Mo.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = express.Router();
// Gestion des modèles : administration de l'organisme uniquement.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', listTemplates);
router.get('/tokens', getTokens);                         // catalogue de jetons (palette)
router.get('/:slug/body', getTemplateBody);               // corps HTML du modèle (éditeur)
router.get('/:slug/file', downloadTemplate);
router.put('/:slug', saveTemplate);                       // métadonnées (étape) + corps builder
router.post('/:slug', upload.single('file'), uploadTemplate); // fichier .docx
router.delete('/:slug', resetTemplate);

module.exports = router;
