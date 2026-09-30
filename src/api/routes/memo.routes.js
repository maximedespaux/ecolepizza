const express = require('express');
const multer = require('multer');
const { listMemos, countMemos, createMemo, getFichier, updateMemo, deleteMemo, clearDoneMemos, marquerVus, chercherCibles } = require('../controllers/memo.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

/* LES MÉMOS DU PERSONNEL (migration 176). Le bureau et les formateurs ont chacun les leurs : ce
   n'est pas une rubrique qu'on délègue (sectionAccess ne la connaît pas, exprès), c'est un
   pense-bête. Le stagiaire, l'intervenant et l'auditeur n'en ont pas. */
const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

/* LES PIÈCES JOINTES (migration 193) : deux au plus, gardées EN MÉMOIRE puis en base, chiffrées.
   Les limites de multer sont AU-DESSUS de celles du contrôleur (lib/memoFichiers.js : 1 Mo pour une
   image, 5 Mo pour un PDF), pour que ce soit lui qui réponde — « trop lourd : 5 Mo au plus pour un
   PDF » plutôt que le refus générique. Un envoi en JSON, sans fichier, traverse sans être touché. */
const pieces = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 2 } });

router.get('/', listMemos);
router.get('/compte', countMemos);
// Ce que @ et # proposent (migration 177), et « j'ai ouvert mon mémo » qui éteint la pastille.
router.get('/cibles', chercherCibles);
router.post('/vus', marquerVus);
router.post('/', pieces.array('fichiers', 2), createMemo);
// AVANT `/:id` : sinon « faits » serait lu comme l'identifiant d'un mémo.
router.delete('/faits', clearDoneMemos);
router.get('/:id/fichiers/:fichier', getFichier);
router.patch('/:id', updateMemo);
router.delete('/:id', deleteMemo);

module.exports = router;
