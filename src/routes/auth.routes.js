'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth.middleware');
const { validate } = require('../utils/validators');

const router = Router();

router.post('/register', validate('register', 'body'), asyncHandler(ctrl.register));
router.post('/login', validate('login', 'body'), asyncHandler(ctrl.login));
router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.post(
  '/change-password',
  requireAuth,
  validate('changePassword', 'body'),
  asyncHandler(ctrl.changePassword)
);

module.exports = router;
