const express = require('express');
const { listSessions, getSession } = require('../controllers/notation.controller.js');
const { authenticateToken, authorizeRoles, STAFF_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.use(authenticateToken, authorizeRoles(...STAFF_ROLES));

/* LECTURE SEULE. Cet écran ADDITIONNE ce qui a été saisi ailleurs — au QCM, sur la session, par
   le jury. Y ouvrir une saisie créerait un second endroit où noter, et deux endroits finissent
   toujours par ne plus dire la même chose. */
router.get('/sessions', listSessions);
router.get('/session/:id', getSession);

module.exports = router;
