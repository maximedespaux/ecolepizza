const express = require('express');
const { getPartners, createPartner } = require('../controllers/partner.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getPartners);
router.post('/', authenticateToken, createPartner);

module.exports = router;
