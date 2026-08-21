const express = require('express');
const { getSessions, getSession, createSession, updateSession, deleteSession, getSessionBoard, listTrainers, setSessionTrainers } = require('../controllers/session.controller.js');
const { listSessionIntervenants, addSessionIntervenant, setIntervenantSlots, removeSessionIntervenant } = require('../controllers/intervenant.controller.js');
const { getSessionConsents, setConsentPourStagiaire, getManquantsParSession } = require('../controllers/consentement.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Lecture : tout le personnel (le formateur consulte ses sessions pour l'émargement).
router.get('/', authorizeRoles(...STAFF_ROLES), getSessions);
router.get('/trainers', authorizeRoles(...STAFF_ROLES), listTrainers); // avant /:id
/* AVANT `/:id`, IMPÉRATIVEMENT : un seul segment, comme lui. Déclarée après, cette route ne
 * serait jamais atteinte — Express prendrait `/:id` et irait chercher une session dont
 * l'identifiant serait « consentements-manquants ». Bureau uniquement, comme tout le suivi des
 * consentements : le calendrier est ouvert au formateur, cette marque ne l'est pas. */
router.get('/consentements-manquants', authorizeRoles(...ADMIN_ROLES), getManquantsParSession);
router.get('/:id', authorizeRoles(...STAFF_ROLES), getSession);
router.get('/:id/board', authorizeRoles(...STAFF_ROLES), getSessionBoard);
router.get('/:id/intervenants', authorizeRoles(...STAFF_ROLES), listSessionIntervenants);
// Écriture : bureau uniquement (pas le formateur).
router.post('/', authorizeRoles(...ADMIN_ROLES), createSession);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updateSession);
router.put('/:id/trainers', authorizeRoles(...ADMIN_ROLES), setSessionTrainers);
router.post('/:id/intervenants', authorizeRoles(...ADMIN_ROLES), addSessionIntervenant);
router.put('/:id/intervenants/:siId/slots', authorizeRoles(...ADMIN_ROLES), setIntervenantSlots);
router.delete('/:id/intervenants/:siId', authorizeRoles(...ADMIN_ROLES), removeSessionIntervenant);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deleteSession);

/* CONSENTEMENTS ET TRANSMISSION AUX PARTENAIRES (migration 130) — BUREAU UNIQUEMENT, formateur
 * exclu, et c'est délibéré alors qu'il lit tout le reste de la session.
 *
 * La minimisation ne s'arrête pas à la porte de l'organisme : savoir qui a refusé de céder ses
 * coordonnées n'aide en rien à enseigner, et cette information change le regard porté sur un
 * stagiaire. Le formateur recueille le formulaire papier, le secrétariat le saisit — c'est déjà
 * ainsi que circule le reste du dossier administratif.
 *
 * `POST /transmission` n'est pas une simple lecture : il PRODUIT la liste destinée à un tiers et
 * l'inscrit au journal. Il engage l'organisme, il reste au bureau. */
router.get('/:id/consentements', authorizeRoles(...ADMIN_ROLES), getSessionConsents);
router.put('/:id/consentements/:learnerId', authorizeRoles(...ADMIN_ROLES), setConsentPourStagiaire);
/* L'EXPORT A QUITTÉ CETTE PAGE. Il vit désormais sur la fiche du partenaire, où il couvre une
 * PÉRIODE plutôt qu'une session — c'est là qu'on choisit à qui l'on écrit. La page de la session
 * garde le SUIVI des consentements, qui est son sujet : qui a accepté, qui a refusé, qui n'a
 * jamais été sollicité. */

module.exports = router;
