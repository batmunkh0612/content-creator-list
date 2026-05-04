'use strict';

require('dotenv').config();

const required = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const num = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`Env var ${key} must be a number`);
  return parsed;
};

const bool = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num('PORT', 3000),
  logLevel: process.env.LOG_LEVEL || 'info',

  databaseUrl: required('DATABASE_URL'),

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: num('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: required('JWT_SECRET', 'dev-only-secret-change-me'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  rateLimit: {
    windowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),
    max: num('RATE_LIMIT_MAX', 100),
  },

  cache: {
    ttlSeconds: num('CACHE_TTL_SECONDS', 300),
  },

  worker: {
    concurrency: num('WORKER_CONCURRENCY', 2),
  },

  scraper: {
    headless: bool('SCRAPER_HEADLESS', true),
    proxyList: (process.env.PROXY_LIST || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    minDelayMs: num('SCRAPER_MIN_DELAY_MS', 2000),
    maxDelayMs: num('SCRAPER_MAX_DELAY_MS', 5000),
    maxRetries: num('SCRAPER_MAX_RETRIES', 3),
    // Authenticated session cookies. Set these to unlock precise data from
    // platforms that rate-limit / round counts for anonymous callers.
    igSessionId: process.env.IG_SESSIONID || '',
    igDsUserId: process.env.IG_DS_USER_ID || '',
    // Full cookie jar pasted from DevTools (Application → Cookies → instagram.com).
    // When set, this is the source of truth — used verbatim as the Cookie
    // header for all bare-fetch IG API calls, which IG requires (csrftoken,
    // mid, datr, rur, etc. all need to match a real browser session).
    igCookies: stripQuotes((process.env.IG_COOKIES || '').trim()),
    // The x-ig-www-claim HMAC header. Captured per-session from any IG XHR.
    igWwwClaim: stripQuotes((process.env.IG_WWW_CLAIM || '').trim()),

    // ===== Facebook =======================================================
    // Auth cookies are required for any reliable FB scrape — anonymous
    // traffic redirects to the login wall within seconds. Paste from
    // DevTools → Application → Cookies → www.facebook.com (must include
    // c_user, xs, fr, datr at minimum).
    fbCookies: stripQuotes((process.env.FB_COOKIES || '').trim()),
    // The viewer's actor PK. FB's GraphQL handler 403s on logged-in cookies
    // with `av=0`. Read from the c_user cookie if not set explicitly.
    fbUserPk: (process.env.FB_USER_PK || '').trim(),
    // Optional override — `fb_dtsg` is otherwise extracted from page HTML
    // each session (5-min cache).
    fbDtsg: stripQuotes((process.env.FB_DTSG || '').trim()),
  },
};

// Strip a single layer of wrapping quotes — users frequently paste curl -b
// values with the surrounding ' or " still attached.
function stripQuotes(s) {
  if (!s) return s;
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
