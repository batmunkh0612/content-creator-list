'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/dashboard.controller');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth.middleware');

const router = Router();

router.get('/summary', requireAuth, asyncHandler(ctrl.summary));

module.exports = router;
