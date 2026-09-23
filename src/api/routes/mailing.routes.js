const express = require('express');
const {
    getModeles, saveModele, resetModele, apercu, getDestinataires, envoyerGroupe, getEnvois,
} = require('../controllers/mailing.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

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

module.exports = router;
