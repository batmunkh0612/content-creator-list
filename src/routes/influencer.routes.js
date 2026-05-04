'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/influencer.controller');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth.middleware');
const { validate, validatePlatform } = require('../utils/validators');

const router = Router();

router.get(
  '/',
  requireAuth,
  validate('influencerQuery', 'query'),
  asyncHandler(ctrl.list)
);

// Followers / following lists — must come before the catch-all
// /:platform/:username so the suffixes don't get treated as a username.
router.get(
  '/:platform/:username/followers',
  requireAuth,
  validatePlatform,
  asyncHandler(ctrl.getFollowers)
);
router.get(
  '/:platform/:username/following',
  requireAuth,
  validatePlatform,
  asyncHandler(ctrl.getFollowing)
);

router.post(
  '/:platform/:username/recompute-metrics',
  requireAuth,
  validatePlatform,
  asyncHandler(ctrl.recomputeMetrics)
);

router.get(
  '/:platform/:username',
  requireAuth,
  validatePlatform,
  asyncHandler(ctrl.getOne)
);

// Backwards-compat: /:username defaults to instagram.
router.get(
  '/:username',
  requireAuth,
  asyncHandler(ctrl.getOne)
);

module.exports = router;
