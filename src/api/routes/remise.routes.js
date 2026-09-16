const express = require('express');
const multer = require('multer');
const { listTypes, createType, updateType, deleteType, listDossier,
    deposer, accuser, servirFichier, supprimerFichier, MAX_OCTETS } = require('../controllers/remise.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

/* La coupure de multer est VOLONTAIREMENT au-dessus de celle du contrôleur : elle arrête un
   envoi démesuré au transport, et le contrôleur garde la main pour répondre un 413 lisible
   plutôt qu'une erreur brute. `memoryStorage` : le fichier part en base, jamais sur le disque.
   Pas de plafond par type ici, contrairement aux pièces — une remise n'a pas de réglage propre,
   donc multer peut se caler juste au-dessus du plafond unique. */
const depot = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_OCTETS + 512 * 1024, files: 1 } });

/* ─── Référentiel : ce que l'organisme PEUT remettre ─── */
// Lecture ouverte au personnel : le formateur doit voir ce qui est remis à sa promotion.
router.get('/', authorizeRoles(...STAFF_ROLES), listTypes);
router.post('/', authorizeRoles(...ADMIN_ROLES), createType);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updateType);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteType);

/* ─── Remises ───
   `listDossier` et `servirFichier` NE PASSENT PAS par `authorizeRoles` : le stagiaire est le
   destinataire, et il n'est dans aucune liste de personnel. Le contrôle est fait DANS le
   contrôleur, sur la propriété du dossier — « ce dossier est-il le mien ? » — ce qu'un filtre
   par rôle ne sait pas exprimer. */
router.get('/dossier/:enrollmentId', listDossier);
router.get('/fichier/:id', servirFichier);

/* DÉPOSER ET RETIRER SONT RÉSERVÉS AU PERSONNEL, et c'est la différence de fond avec les pièces :
   ici c'est l'école qui remet. Un stagiaire autorisé à déposer se remettrait un document à
   lui-même, et l'accusé qu'il signerait ensuite ne vaudrait rien. */
router.post('/dossier/:enrollmentId/:remiseTypeId', authorizeRoles(...STAFF_ROLES), depot.single('fichier'), deposer);
router.delete('/fichier/:id', authorizeRoles(...STAFF_ROLES), supprimerFichier);

/* ACCUSER RÉCEPTION N'EST PAS FILTRÉ PAR RÔLE — et surtout pas ouvert au personnel. Le
   contrôleur exige que le demandeur SOIT le stagiaire du dossier : une preuve de remise signée
   par celui qu'elle engage, jamais par l'école à sa place. */
router.post('/:id/accuser', accuser);

module.exports = router;
