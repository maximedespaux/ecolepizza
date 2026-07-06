const express = require('express');
const { getCompanies, createCompany } = require('../controllers/company.controller.js');
const { authenticateToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', authenticateToken, getCompanies);
router.post('/', authenticateToken, createCompany);

module.exports = router;
