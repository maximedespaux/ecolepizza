const express = require('express');
const {
    getGrille, saveGrille, getNotesSession, saveNote, saveVerdict,
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

/* L'AVIS DU JURY est un acte du jury, pas de l'administration : il vit sur la même route que
   la note, avec les mêmes droits. C'est l'espace intervenant (routes/intervenant.routes.js)
   qui ouvre la porte aux membres externes, sous leur propre vérification d'affectation. */
router.put('/verdict', authorizeRoles(...STAFF_ROLES), saveVerdict);

module.exports = router;
