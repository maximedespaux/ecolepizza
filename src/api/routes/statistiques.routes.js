const express = require('express');
const { connexions, connexionsJour } = require('../controllers/statistiques.controller.js');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

/* Qualité & conformité : même lecture que le Suivi et le Journal d'audit (bureau + auditeur). */
router.get('/connexions', authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'AUDITEUR'), connexions);
/* Le détail d'un jour de la courbe : QUI s'est connecté (au clic). Même lecture que ci-dessus. */
router.get('/connexions/jour', authenticateToken, authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'AUDITEUR'), connexionsJour);

module.exports = router;
