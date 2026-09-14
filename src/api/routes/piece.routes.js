const express = require('express');
const multer = require('multer');
const { listTypes, createType, updateType, deleteType, listDossier,
    deposer, servirFichier, supprimerFichier, verifier, MAX_OCTETS_ABSOLU } = require('../controllers/piece.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

/* La coupure de multer est VOLONTAIREMENT au-dessus de celle du contrôleur : elle arrête un
   envoi démesuré au transport, et le contrôleur garde la main pour répondre un 413 lisible
   plutôt qu'une erreur brute. `memoryStorage` : le fichier part en base, jamais sur le disque.

   ELLE SE CALE SUR LE PLAFOND ABSOLU, PAS SUR LE PLAFOND COMMUN. Elle valait
   `MAX_OCTETS + 512 Ko`, soit 3,5 Mo — or `MAX_OCTETS` n'est que le défaut d'une pièce SANS
   réglage propre, et chaque pièce peut relever le sien jusqu'à `MAX_OCTETS_ABSOLU`. Une pièce
   réglée à 10 Mo voyait donc ses fichiers coupés à 3,5 Mo quand même, et l'erreur — levée par
   multer, hors du contrôleur — ne disait rien de lisible. Multer ne connaît pas la pièce visée
   au moment où la route se construit : il ne peut border que l'ABSOLU. La limite fine, celle de
   la pièce, reste appliquée par le contrôleur, qui sait la nommer. */
const depot = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_OCTETS_ABSOLU + 512 * 1024, files: 1 } });

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
