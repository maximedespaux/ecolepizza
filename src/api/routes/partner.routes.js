const express = require('express');
const { getPartners, createPartner, updatePartner, deletePartner, createContribution, deleteContribution,
    getPartnerProducts, createPartnerProduct, updatePartnerProduct, deletePartnerProduct,
    getPartnerCategories, createPartnerCategory, updatePartnerCategory,
    deletePartnerCategory, setPartnerDestinataire } = require('../controllers/partner.controller.js');
const { produireTransmissionPartenaire } = require('../controllers/consentement.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

// Consultation : tout le personnel (dont le formateur, pour le suivi).
router.get('/', authorizeRoles(...STAFF_ROLES), getPartners);

// Contributions en nature : saisie par tout le personnel (dont formateur) ; suppression bureau.
router.post('/contributions', authorizeRoles(...STAFF_ROLES), createContribution);
router.delete('/contributions/:id', authorizeRoles(...ADMIN_ROLES), deleteContribution);

/* Catégories de partenaires (migration 129) — DÉCLARÉES AVANT `/:id`.
 * Aucune des routes ci-dessous n'entre réellement en conflit (`/categories/:cid` a deux segments
 * là où `/:id` n'en a qu'un, et il n'existe ni GET ni POST sur `/:id`), mais l'ordre le garantit
 * quoi qu'on ajoute plus tard : le jour où quelqu'un écrit `router.delete('/:id')` au-dessus,
 * `DELETE /categories` partirait supprimer un partenaire nommé « categories ».
 * Lecture ouverte au personnel comme le reste de l'annuaire ; écriture au bureau. */
router.get('/categories', authorizeRoles(...STAFF_ROLES), getPartnerCategories);
router.post('/categories', authorizeRoles(...ADMIN_ROLES), createPartnerCategory);
router.patch('/categories/:cid', authorizeRoles(...ADMIN_ROLES), updatePartnerCategory);
router.delete('/categories/:cid', authorizeRoles(...ADMIN_ROLES), deletePartnerCategory);

// Gestion des partenaires : bureau uniquement.
router.post('/', authorizeRoles(...ADMIN_ROLES), createPartner);
router.patch('/:id', authorizeRoles(...ADMIN_ROLES), updatePartner);
/* Déclarer un partenaire destinataire des coordonnées : DEUX SEGMENTS, donc aucun conflit avec
 * `/:id`. Route séparée parce que ce n'est pas une propriété de la fiche mais une autorisation de
 * transmettre — cf. le commentaire du contrôleur. */
router.patch('/:id/destinataire', authorizeRoles(...ADMIN_ROLES), setPartnerDestinataire);
/* L'EXPORT DES STAGIAIRES CONSENTANTS, sur une période. Bureau uniquement : il PRODUIT une liste
 * destinée à un tiers et l'inscrit au journal des transmissions — il engage l'organisme, au même
 * titre que son pendant sur la page d'une session. */
router.post('/:id/transmission', authorizeRoles(...ADMIN_ROLES), produireTransmissionPartenaire);
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
