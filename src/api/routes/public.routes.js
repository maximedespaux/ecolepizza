const express = require('express');
const { getSignPage, submitSign } = require('../controllers/public.controller.js');

// Routes PUBLIQUES : aucune authentification (lien de signature partageable).
const router = express.Router();

router.get('/sign/:token', getSignPage);
router.post('/sign/:token', submitSign);

module.exports = router;
