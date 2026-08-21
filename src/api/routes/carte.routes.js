const express = require('express');
const { getCarte, geocodeLearners } = require('../controllers/carte.controller.js');
const { authenticateToken, authorizeRoles, ADMIN_ROLES } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Outil de développement / démarchage : réservé au bureau.
router.use(authenticateToken, authorizeRoles(...ADMIN_ROLES));

router.get('/', getCarte);
router.post('/geocode', geocodeLearners);

module.exports = router;
