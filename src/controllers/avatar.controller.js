'use strict';

const crypto = require('node:crypto');
const prisma = require('../prisma/client');
const logger = require('../utils/logger');

// Server-side proxy for Instagram CDN images, with persistent DB cache.
//
// Lookup chain:
//   1. cached_images row (fresh, expiresAt > now)  → serve from DB
//   2. Fetch from IG with Referer: instagram.com   → store, serve
//   3. Cached row exists but stale + IG fails       → serve stale anyway
//   4. No cached row + IG fails                     → 502
//
// The /avatar route is exempted from the global rate limiter — these are
// asset requests, not user actions, and a profile page can render 60+ at
// once.

const ALLOWED_HOST_SUFFIXES = ['.fbcdn.net', '.cdninstagram.com'];
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_DAYS = 30;
const CACHE_MAX_BYTES = 1 * 1024 * 1024; // 1 MB; avatars are ~5KB, posts can hit ~200KB

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.instagram.com/',
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Dest': 'image',
};

function isAllowedHost(hostname) {
  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function hashUrl(url) {
  return crypto.createHash('sha1').update(url).digest('hex');
}

function sendCached(res, row, cacheTag = 'HIT') {
  res.set('Content-Type', row.mimetype);
  res.set('Content-Length', String(row.size));
  res.set('Cache-Control', 'public, max-age=21600, s-maxage=21600, immutable');
  res.set('X-Cache', cacheTag);
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(row.data));
}

async function proxyImage(req, res) {
  const raw = req.query.u;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).type('text/plain').send('missing u param');
  }
  if (raw.length > 2000) {
    return res.status(400).type('text/plain').send('url too long');
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return res.status(400).type('text/plain').send('invalid url');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return res.status(400).type('text/plain').send('bad protocol');
  }
  if (!isAllowedHost(url.hostname)) {
    return res.status(400).type('text/plain').send('host not allowed');
  }

  const urlHash = hashUrl(raw);
  const now = new Date();

  // 1. DB cache — fresh row wins instantly, no IG call.
  const cached = await prisma.cachedImage.findUnique({ where: { urlHash } });
  if (cached && cached.expiresAt > now) {
    return sendCached(res, cached, 'HIT');
  }

  // 2. Fetch from IG. We get here on first-ever request OR on stale row.
  let upstream;
  try {
    upstream = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ url: url.href, err: err.message }, 'avatar proxy upstream threw');
    // 3. Stale-on-failure: if we have ANY row (even expired), serve it.
    if (cached) return sendCached(res, cached, 'STALE');
    res.set('Cache-Control', 'no-store');
    return res.status(502).type('text/plain').send('upstream failed');
  }

  if (!upstream.ok) {
    if (cached) {
      logger.debug({ url: url.href, status: upstream.status }, 'serving stale on non-ok');
      return sendCached(res, cached, 'STALE');
    }
    res.set('Cache-Control', 'no-store');
    return res.status(upstream.status).type('text/plain').send(`upstream ${upstream.status}`);
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await upstream.arrayBuffer());

  // Size sanity-check — don't fill the cache with a giant blob.
  if (buffer.length > CACHE_MAX_BYTES) {
    logger.warn({ url: url.href, size: buffer.length }, 'image too large to cache');
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=21600');
    res.set('X-Cache', 'BYPASS');
    return res.send(buffer);
  }

  // 4. Persist to DB — upsert so re-fetch refreshes existing rows.
  const expiresAt = new Date(Date.now() + CACHE_DAYS * 86_400_000);
  try {
    await prisma.cachedImage.upsert({
      where: { urlHash },
      create: {
        urlHash,
        url: raw,
        mimetype: contentType,
        data: buffer,
        size: buffer.length,
        status: 200,
        expiresAt,
      },
      update: {
        mimetype: contentType,
        data: buffer,
        size: buffer.length,
        status: 200,
        fetchedAt: new Date(),
        expiresAt,
      },
    });
  } catch (err) {
    // Persistence failure is non-fatal — still return the bytes. The DB
    // pool may be saturated; better to serve and log than to error.
    logger.warn({ urlHash, err: err.message }, 'cached_images upsert failed');
  }

  res.set('Content-Type', contentType);
  res.set('Content-Length', String(buffer.length));
  res.set('Cache-Control', 'public, max-age=21600, s-maxage=21600, immutable');
  res.set('X-Cache', 'MISS');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
}

module.exports = { proxyImage };
