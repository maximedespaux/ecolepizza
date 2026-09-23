const express = require('express');
const multer = require('multer');
const {
    getModeles, saveModele, resetModele, apercu, getDestinataires, envoyerGroupe, getEnvois,
    getRegles, creerRegle, modifierRegle, supprimerRegle,
    televerserImage, listerImages, servirImage, supprimerImage,
} = require('../controllers/mailing.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

/* `memoryStorage` : l'image part en base, jamais sur le disque du serveur — même règle que les
   photos de la communauté et les pièces justificatives. La limite de multer est au-dessus de
   celle du contrôleur (600 Ko) pour que ce dernier puisse répondre un 413 lisible plutôt qu'une
   erreur brute. */
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 800 * 1024, files: 1 } });

const router = express.Router();
router.use(authenticateToken);

/* TOUT EST RÉSERVÉ À L'ADMINISTRATION, lecture comprise. Ces écrans disent ce que l'école écrit à
   ses stagiaires et donnent la liste de leurs adresses : ce n'est pas un réglage de plus, c'est
   la parole de l'organisme et le carnet d'adresses derrière. Le secrétariat écrit aux stagiaires
   depuis leur fiche, une personne à la fois. */
router.get('/modeles', authorizeRoles(...ADMIN_ROLES), getModeles);
router.put('/modeles/:cle', authorizeRoles(...ADMIN_ROLES), saveModele);
router.delete('/modeles/:cle', authorizeRoles(...ADMIN_ROLES), resetModele);
router.post('/apercu', authorizeRoles(...ADMIN_ROLES), apercu);

/* `POST` POUR UNE LECTURE, et c'est délibéré : la liste des destinataires se demande avec des
   identifiants de stagiaires, qui n'ont rien à faire dans une URL — elle finirait dans les
   journaux du serveur et dans l'historique du navigateur. */
router.post('/destinataires', authorizeRoles(...ADMIN_ROLES), getDestinataires);
router.post('/envoi', authorizeRoles(...ADMIN_ROLES), envoyerGroupe);
router.get('/envois', authorizeRoles(...ADMIN_ROLES), getEnvois);

/* LES ENVOIS PROGRAMMÉS (migration 179) — une règle part toute seule, ensuite, sans que personne
   ne la relise. C'est donc bien de l'administration : la poser engage l'école auprès de gens
   qu'elle ne choisira plus un par un. */
router.get('/regles', authorizeRoles(...ADMIN_ROLES), getRegles);
router.post('/regles', authorizeRoles(...ADMIN_ROLES), creerRegle);
router.put('/regles/:id', authorizeRoles(...ADMIN_ROLES), modifierRegle);
router.delete('/regles/:id', authorizeRoles(...ADMIN_ROLES), supprimerRegle);

/* LES IMAGES DU MAILING (migration 180) — déposées une fois, citées dans les messages. */
router.get('/images', authorizeRoles(...ADMIN_ROLES), listerImages);
router.post('/images', authorizeRoles(...ADMIN_ROLES), imageUpload.single('image'), televerserImage);
router.get('/images/:id', authorizeRoles(...ADMIN_ROLES), servirImage);
router.delete('/images/:id', authorizeRoles(...ADMIN_ROLES), supprimerImage);

module.exports = router;
