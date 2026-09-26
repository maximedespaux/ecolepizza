const express = require('express');
const { listTemplates, createTemplate, updateTemplate, deleteTemplate, reorderTemplates, previewPdf } = require('../controllers/emargementTemplate.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Modèles de feuille d'émargement : administration de l'organisme uniquement.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', listTemplates);
router.post('/', createTemplate);
router.post('/preview-pdf', previewPdf); // aperçu fidèle : la vraie mise en page, sur une feuille d'exemple
router.put('/reorder', reorderTemplates); // avant /:id
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

module.exports = router;
