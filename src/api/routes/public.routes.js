const express = require('express');
const {
    getSignPage, submitSign, getNewsletterUnsub, postNewsletterUnsub,
} = require('../controllers/public.controller.js');

// Routes PUBLIQUES : aucune authentification (lien de signature partageable, désinscription newsletter).
const router = express.Router();

router.get('/sign/:token', getSignPage);
router.post('/sign/:token', submitSign);

/* Désinscription de la newsletter : GET valide + affiche, POST désinscrit (geste délibéré, pas un
   pré-chargement du client mail). */
router.get('/newsletter/:token', getNewsletterUnsub);
router.post('/newsletter/:token', postNewsletterUnsub);

module.exports = router;
