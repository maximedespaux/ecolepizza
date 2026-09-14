const express = require('express');
const {
    getCommission, saveCommission, saveDecision, cloturerCommission, pvPdf,
} = require('../controllers/examen.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken);

/* LA COMMISSION EST UN ACTE D'ADMINISTRATION. Elle fixe la certification visée, le numéro de
   procès-verbal et la composition du jury — ce qui engage l'organisme devant le certificateur.
   Un formateur la LIT (il y siège souvent), il ne la compose pas. */
router.get('/session/:id', authorizeRoles(...STAFF_ROLES), getCommission);
router.put('/session/:id', authorizeRoles(...ADMIN_ROLES), saveCommission);
router.put('/decision', authorizeRoles(...ADMIN_ROLES), saveDecision);
router.post('/session/:id/cloturer', authorizeRoles(...ADMIN_ROLES), cloturerCommission);
router.post('/session/:id/pv', authorizeRoles(...STAFF_ROLES), pvPdf);

module.exports = router;
