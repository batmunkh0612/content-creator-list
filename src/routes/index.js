'use strict';

const { Router } = require('express');
const authRoutes = require('./auth.routes');
const influencerRoutes = require('./influencer.routes');
const scrapeRoutes = require('./scrape.routes');
const dashboardRoutes = require('./dashboard.routes');
const sessionsRoutes = require('./sessions.routes');
const avatarController = require('../controllers/avatar.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Image proxy for IG CDN URLs. NO auth — `<img>` tags can't send the JWT,
// and the controller already restricts to fbcdn/cdninstagram hosts to
// prevent open-proxy abuse.
router.get('/avatar', asyncHandler(avatarController.proxyImage));

router.use('/auth', authRoutes);
router.use('/influencer', influencerRoutes); // GET /influencer/:username
router.use('/influencers', influencerRoutes); // GET /influencers (filtered list)
router.use('/scrape', scrapeRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/sessions', sessionsRoutes);

module.exports = router;
