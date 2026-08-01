const express = require('express');
const multer = require('multer');
const {
    listTemplates, saveTemplate, uploadTemplate, downloadTemplate, resetTemplate, duplicateTemplate,
    renameTemplate, getTokens, getTemplateBody, reorderTemplates, previewPdf, pageMetrics,
    getCustomTokens, saveCustomTokens,
} = require('../controllers/template.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

// Fichier en mémoire (stocké ensuite en base). Limite 20 Mo.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = express.Router();
// Gestion des modèles : administration de l'organisme uniquement.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', listTemplates);
router.put('/reorder', reorderTemplates);                 // ordre des modèles (glisser-déposer)
router.get('/tokens', getTokens);                         // catalogue de jetons (palette)
router.get('/custom-tokens', getCustomTokens);            // jetons personnalisés (liste)
router.put('/custom-tokens', saveCustomTokens);           // jetons personnalisés (enregistrer)
router.get('/:slug/body', getTemplateBody);               // corps HTML du modèle (éditeur)
router.post('/:slug/preview-pdf', previewPdf);            // aperçu PDF fidèle (éditeur)
router.post('/:slug/page-metrics', pageMetrics);         // marges réservées (repère fin de page)
router.get('/:slug/file', downloadTemplate);
router.put('/:slug', saveTemplate);                       // métadonnées (étape) + corps builder
router.post('/:slug/duplicate', duplicateTemplate);       // dupliquer un modèle
router.put('/:slug/rename', renameTemplate);              // renommer l'identifiant (slug) + cascade
router.post('/:slug', upload.single('file'), uploadTemplate); // fichier .docx
router.delete('/:slug', resetTemplate);

module.exports = router;
