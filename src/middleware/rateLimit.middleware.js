'use strict';

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const { sharedClient } = require('../config/redis');
const env = require('../config/env');

// Asset / health paths shouldn't count toward the 100/min API budget.
// Avatar proxy in particular gets 60+ requests on a single page render.
const RATE_LIMIT_SKIP_PREFIXES = ['/avatar', '/health'];

const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    RATE_LIMIT_SKIP_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`)) ||
    req.path === '/avatar', // exact match for /avatar?u=...
  store: new RedisStore({
    sendCommand: (...args) => sharedClient.call(...args),
    prefix: 'rl:api:',
  }),
  message: { error: { message: 'Too many requests, please slow down.' } },
});

// Tighter limiter for the scrape enqueue endpoint — scraping is expensive
// and Instagram will block harder if we hammer it.
const scrapeLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => sharedClient.call(...args),
    prefix: 'rl:scrape:',
  }),
  message: { error: { message: 'Scrape rate limit exceeded.' } },
});

module.exports = { apiLimiter, scrapeLimiter };
