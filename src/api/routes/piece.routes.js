const express = require('express');
const multer = require('multer');
const { listTypes, createType, updateType, deleteType, listDossier,
    deposer, servirFichier, supprimerFichier, verifier, MAX_OCTETS } = require('../controllers/piece.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

/* La coupure de multer est VOLONTAIREMENT au-dessus de celle du contrôleur (3 Mo) : elle arrête
   un envoi démesuré au transport, et le contrôleur garde la main pour répondre un 413 lisible
   plutôt qu'une erreur brute. Même dispositif que pour les photos de publication.
   `memoryStorage` : le fichier part en base, il ne touche jamais le disque. */
const depot = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_OCTETS + 512 * 1024, files: 1 } });

/* ─── Référentiel : ce que l'organisme PEUT demander ─── */
// Lecture ouverte au personnel : le formateur doit voir ce qui est exigé de sa promotion.
router.get('/', authorizeRoles(...STAFF_ROLES), listTypes);
router.post('/', authorizeRoles(...ADMIN_ROLES), createType);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updateType);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteType);

/* ─── Dépôts ───
   Ces routes NE PASSENT PAS par `authorizeRoles` : le stagiaire est le premier concerné, et il
   n'est dans aucune liste de personnel. Le contrôle est fait DANS le contrôleur, sur la
   propriété du dossier — « ce dossier est-il le mien ? » — ce qu'un filtre par rôle ne sait pas
   exprimer. Il faut donc lire `deposer`, `servirFichier` et `supprimerFichier` pour voir la
   garde ; elle y est, et elle est plus stricte qu'un rôle. */
router.get('/dossier/:enrollmentId', listDossier);
router.post('/dossier/:enrollmentId/:pieceTypeId', depot.single('fichier'), deposer);
router.get('/fichier/:id', servirFichier);
router.delete('/fichier/:id', supprimerFichier);

// Vérifier engage l'école : réservé au personnel, jamais au stagiaire lui-même.
router.patch('/depot/:id', authorizeRoles(...STAFF_ROLES), verifier);

module.exports = router;
