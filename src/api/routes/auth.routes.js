const express = require('express');
const { userAuthentification, getCurrentUser, changePassword, changeEmail, logout, forgotPassword, resetPassword } = require('../controllers/auth.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const { rateLimit } = require('../middlewares/rateLimit.js');

const router = express.Router();

/* ANTI-FORCE BRUTE. Les plafonds ne comptent QUE les échecs (cf. rateLimit) : une connexion
   réussie n'entame rien, et efface même l'ardoise.
   · 8 échecs par quart d'heure sur un MÊME identifiant depuis une même adresse. De quoi se
     tromper plusieurs fois de bonne foi, très loin de ce qu'exige une liste de mots de passe.
   · 60 échecs par quart d'heure pour l'adresse entière, tous identifiants confondus. Ce second
     plafond arrête l'essai d'un même mot de passe sur cent comptes, que le premier laisserait
     passer. Il est large À DESSEIN : une promotion entière partage l'IP de l'école, et le
     bloquer serait fermer la porte à toute la classe. */
const loginLimiter = rateLimit({ windowMs: 15 * 60000, max: 8, maxIp: 60, key: 'login' });
// Changement de mot de passe et d'e-mail : la cible est le compte CONNECTÉ, pas un e-mail saisi
// — d'où la clé sur l'identifiant du jeton. Plus serré : on connaît déjà son propre mot de passe.
const passwordLimiter = rateLimit({
    windowMs: 15 * 60000, max: 5, maxIp: 40, key: 'pwd',
    identifiant: (req) => String(req.user?.id || ''),
});

// « Mot de passe oublié » : la réponse est TOUJOURS 200 (anti-énumération), donc compter les
// échecs ne bornerait rien. countAll compte chaque requête — quatre demandes par quart d'heure
// pour un même e-mail depuis une même IP, vingt pour l'IP entière : de quoi réessayer sans
// permettre de bombarder une victime d'e-mails de réinitialisation.
const forgotLimiter = rateLimit({ windowMs: 15 * 60000, max: 4, maxIp: 20, key: 'forgot', countAll: true });
// Pose du nouveau mot de passe : clé sur le jeton, comptage par requête (un lien invalide rend 400,
// que le comptage d'échecs ignorerait) — freine le forçage d'un jeton.
const resetLimiter = rateLimit({
    windowMs: 15 * 60000, max: 10, maxIp: 40, key: 'reset', countAll: true,
    identifiant: (req) => String(req.body?.token || '').slice(0, 24),
});

router.post('/', loginLimiter, userAuthentification);
router.post('/forgot', forgotLimiter, forgotPassword);
router.post('/reset', resetLimiter, resetPassword);
router.get('/me', authenticateToken, getCurrentUser);
router.patch('/password', authenticateToken, passwordLimiter, changePassword);
router.patch('/email', authenticateToken, passwordLimiter, changeEmail);
router.post('/logout', authenticateToken, logout);

module.exports = router;
