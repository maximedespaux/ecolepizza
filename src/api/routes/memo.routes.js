const express = require('express');
const { listMemos, countMemos, createMemo, updateMemo, deleteMemo, clearDoneMemos, marquerVus, chercherCibles } = require('../controllers/memo.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

/* LES MÉMOS DU PERSONNEL (migration 176). Le bureau et les formateurs ont chacun les leurs : ce
   n'est pas une rubrique qu'on délègue (sectionAccess ne la connaît pas, exprès), c'est un
   pense-bête. Le stagiaire, l'intervenant et l'auditeur n'en ont pas. */
const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

router.get('/', listMemos);
router.get('/compte', countMemos);
// Ce que @ et # proposent (migration 177), et « j'ai ouvert mon mémo » qui éteint la pastille.
router.get('/cibles', chercherCibles);
router.post('/vus', marquerVus);
router.post('/', createMemo);
// AVANT `/:id` : sinon « faits » serait lu comme l'identifiant d'un mémo.
router.delete('/faits', clearDoneMemos);
router.patch('/:id', updateMemo);
router.delete('/:id', deleteMemo);

module.exports = router;
