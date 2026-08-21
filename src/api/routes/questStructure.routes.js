const express = require('express');
const {
    getQuestStructure, createQuestCategory, updateQuestCategory, deleteQuestCategory,
    setProgramCategories, addQuestPrerequisite, deleteQuestPrerequisite,
} = require('../controllers/questStructure.controller.js');
const {
    getQuestContent, createQuestDifficulty, updateQuestDifficulty, deleteQuestDifficulty,
    createQuestChapter, updateQuestChapter, deleteQuestChapter,
    createQuestQuestion, updateQuestQuestion, deleteQuestQuestion,
} = require('../controllers/questContent.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Paramétrage de Pizza Quest : bureau uniquement. Le stagiaire consomme la structure via
// /api/mon-espace (lecture seule) — il ne la modifie jamais.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/structure', getQuestStructure);

router.post('/categories', createQuestCategory);
router.put('/categories/:id', updateQuestCategory);
router.delete('/categories/:id', deleteQuestCategory);

router.put('/programs/:id', setProgramCategories);

router.post('/prerequisites', addQuestPrerequisite);
router.delete('/prerequisites/:id', deleteQuestPrerequisite);

/* Banque de questions (phase 2). */
router.get('/content', getQuestContent);

router.post('/difficulties', createQuestDifficulty);
router.put('/difficulties/:id', updateQuestDifficulty);
router.delete('/difficulties/:id', deleteQuestDifficulty);

router.post('/chapters', createQuestChapter);
router.put('/chapters/:id', updateQuestChapter);
router.delete('/chapters/:id', deleteQuestChapter);

router.post('/questions', createQuestQuestion);
router.put('/questions/:id', updateQuestQuestion);
router.delete('/questions/:id', deleteQuestQuestion);

module.exports = router;
