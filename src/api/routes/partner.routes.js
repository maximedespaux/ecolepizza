const express = require('express');
const { getPartners, createPartner, updatePartner, deletePartner, createContribution, deleteContribution,
    getPartnerProducts, createPartnerProduct, updatePartnerProduct, deletePartnerProduct } = require('../controllers/partner.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Consultation : tout le personnel (dont le formateur, pour le suivi).
router.get('/', authorizeRoles(...STAFF_ROLES), getPartners);

// Contributions en nature : saisie par tout le personnel (dont formateur) ; suppression bureau.
router.post('/contributions', authorizeRoles(...STAFF_ROLES), createContribution);
router.delete('/contributions/:id', authorizeRoles(...ADMIN_ROLES), deleteContribution);

// Gestion des partenaires : bureau uniquement.
router.post('/', authorizeRoles(...ADMIN_ROLES), createPartner);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updatePartner);
router.delete('/:id', authorizeRoles(...ADMIN_ROLES), deletePartner);

/* Produits d'un partenaire — le catalogue montré aux stagiaires (onglet « Offres partenaires »).
 * Consultation ouverte au personnel comme le reste des partenaires ; écriture au bureau, puisque
 * ces prix engagent l'école vis-à-vis du stagiaire.
 * Les routes de modification portent le seul identifiant du PRODUIT — celui du partenaire s'en
 * déduit. Aucun conflit avec `/:id` (partenaire) : Express distingue par NOMBRE DE SEGMENTS,
 * et `/produits/xxx` en a deux là où `/:id` n'en a qu'un. */
router.get('/:id/produits', authorizeRoles(...STAFF_ROLES), getPartnerProducts);
router.post('/:id/produits', authorizeRoles(...ADMIN_ROLES), createPartnerProduct);
router.patch('/produits/:pid', authorizeRoles(...ADMIN_ROLES), updatePartnerProduct);
router.delete('/produits/:pid', authorizeRoles(...ADMIN_ROLES), deletePartnerProduct);

module.exports = router;
