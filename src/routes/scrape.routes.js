'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/scrape.controller');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth.middleware');
const { validate, validatePlatform } = require('../utils/validators');
const { scrapeLimiter } = require('../middleware/rateLimit.middleware');

const router = Router();

// /scrape/bulk and /scrape/refresh-all MUST come before any /:username
// matcher, otherwise Express treats "bulk" / "refresh-all" as usernames.
router.post(
  '/bulk',
  requireAuth,
  scrapeLimiter,
  validate('bulkScrape', 'body'),
  asyncHandler(ctrl.bulkEnqueue)
);

router.post(
  '/refresh-all',
  requireAuth,
  scrapeLimiter,
  validate('refreshAll', 'body'),
  asyncHandler(ctrl.refreshAll)
);

// Bulk fetch followers for every tracked profile (instagram-only). The
// path segment "/followers/refresh-all" is unique enough not to collide
// with /:platform/:username/followers below.
router.post(
  '/followers/refresh-all',
  requireAuth,
  scrapeLimiter,
  asyncHandler(ctrl.refreshAllFollowers)
);
router.post(
  '/following/refresh-all',
  requireAuth,
  scrapeLimiter,
  asyncHandler(ctrl.refreshAllFollowing)
);

// Listing must come before /jobs/:id so 'jobs' isn't treated as an id.
router.get('/jobs', requireAuth, asyncHandler(ctrl.listJobs));
// Bulk retry must also come before /:id so 'retry-all' isn't matched as an id.
router.post(
  '/jobs/retry-all',
  requireAuth,
  scrapeLimiter,
  asyncHandler(ctrl.retryAllJobs)
);
router.get('/jobs/:id', requireAuth, asyncHandler(ctrl.jobStatus));
router.post(
  '/jobs/:id/retry',
  requireAuth,
  scrapeLimiter,
  asyncHandler(ctrl.retryJob)
);

// /scrape/:platform/:username/{followers|following} — must come before the
// bare /:platform/:username route so they don't get swallowed as a username.
router.post(
  '/:platform/:username/followers',
  requireAuth,
  scrapeLimiter,
  validatePlatform,
  asyncHandler(ctrl.enqueueFollowersScrape)
);
router.post(
  '/:platform/:username/following',
  requireAuth,
  scrapeLimiter,
  validatePlatform,
  asyncHandler(ctrl.enqueueFollowingScrape)
);
router.post(
  '/:platform/:username/posts',
  requireAuth,
  scrapeLimiter,
  validatePlatform,
  asyncHandler(ctrl.enqueuePostsScrape)
);
router.post(
  '/:platform/:username/reels',
  requireAuth,
  scrapeLimiter,
  validatePlatform,
  asyncHandler(ctrl.enqueueReelsScrape)
);
router.post(
  '/:platform/:username/stories',
  requireAuth,
  scrapeLimiter,
  validatePlatform,
  asyncHandler(ctrl.enqueueStoriesScrape)
);

// Multi-platform: /scrape/:platform/:username
router.post(
  '/:platform/:username',
  requireAuth,
  scrapeLimiter,
  validatePlatform,
  asyncHandler(ctrl.enqueue)
);

// Backwards-compat: /scrape/:username (defaults to instagram)
router.post(
  '/:username',
  requireAuth,
  scrapeLimiter,
  asyncHandler(ctrl.enqueue)
);

module.exports = router;
