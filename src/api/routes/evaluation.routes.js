const express = require('express');
const {
    getGrille, saveGrille, getNotesSession, saveNote,
} = require('../controllers/evaluation.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

/* CONFIGURER LA GRILLE est un acte d'administration : on y fixe le barème et le seuil de
   réussite, c'est-à-dire ce que « réussir » veut dire. La SAISIE, elle, appartient au
   formateur — c'est lui qui a le groupe devant lui, chronomètre en main. La même séparation
   que l'émargement : le bureau prépare la feuille, le formateur la remplit. */
router.get('/formation/:programId', authorizeRoles(...STAFF_ROLES), getGrille);
router.put('/formation/:programId', authorizeRoles(...ADMIN_ROLES), saveGrille);

router.get('/session/:id', authorizeRoles(...STAFF_ROLES), getNotesSession);
router.put('/note', authorizeRoles(...STAFF_ROLES), saveNote);

/* PAS DE ROUTE « VERDICT » ICI, ET C'EST VOULU. L'avis est prononcé par le jury, qui le saisit
   depuis son espace (routes/intervenant.routes.js) — celle-ci délègue au même contrôleur après
   avoir vérifié l'affectation. Ouvrir en plus une porte pour le bureau créerait une capacité
   que personne n'emprunte : du code mort, ou pire, un chemin qui contourne la vérification
   d'affectation sans que personne ne s'en serve assez pour le remarquer. */

module.exports = router;
