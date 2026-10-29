const express = require('express');
const {
    getSignPage, submitSign, getPvSignPage, submitPvSign, getNewsletterUnsub, postNewsletterUnsub,
} = require('../controllers/public.controller.js');
const { rateLimit } = require('../middlewares/rateLimit.js');

// Routes PUBLIQUES : aucune authentification (lien de signature partageable, désinscription newsletter).
const router = express.Router();

router.get('/sign/:token', getSignPage);
router.post('/sign/:token', submitSign);

/* Signature À DISTANCE du procès-verbal de jury, par un membre de la commission ou un candidat.
   Comme le lien de signature d'un document : protégé par son jeton signé (JWT) et la clé UNIQUE de
   `exam_signature` (une signature par signataire) — pas d'amplification, donc pas de plafond ici. */
router.get('/pv-sign/:token', getPvSignPage);
router.post('/pv-sign/:token', submitPvSign);

/* Désinscription de la newsletter : GET valide + affiche, POST désinscrit (geste délibéré, pas un
   pré-chargement du client mail).
   PLAFOND (audit du 2026-10-07) : le POST écrit en base (consent_record) à CHAQUE appel et le lien
   est PERMANENT (JWT sans expiration, par choix — se désinscrire doit toujours marcher). Sans limite,
   son porteur pouvait gonfler la table en boucle. On borne par jeton ET par IP ; `countAll` parce que
   la réponse est toujours un 200 générique (rien à compter sur les seuls échecs). La signature, elle,
   est protégée par son jeton de 256 bits et son `used_at` — pas d'amplification, pas de plafond ici
   pour ne pas gêner un employeur qui signe beaucoup de conventions. */
const newsletterLimiter = rateLimit({
    windowMs: 15 * 60000, max: 15, maxIp: 60, key: 'nl-unsub', countAll: true,
    identifiant: (req) => String(req.params.token || '').slice(0, 24),
});
router.get('/newsletter/:token', newsletterLimiter, getNewsletterUnsub);
router.post('/newsletter/:token', newsletterLimiter, postNewsletterUnsub);

module.exports = router;
