'use strict';

const { parseCount } = require('../utils/normalize');
const { buildFbHtmlHeaders } = require('./facebook.headers');
const logger = require('../utils/logger');
const env = require('../config/env');

// Playwright + the JSON-LD extractor are imported lazily — they pull in
// large native deps that aren't required for the HTTP-first happy path.
let _browser, _extractor;
const browserMod = () => {
  if (!_browser) _browser = require('./browser');
  return _browser;
};
const extractorMod = () => {
  if (!_extractor) _extractor = require('./_extractor');
  return _extractor;
};
const randomDelay = async () => {
  // Honour the same delay range as the IG path even when Playwright isn't
  // loaded (so retries jitter properly).
  try { return await browserMod().randomDelay(); }
  catch {
    const min = env.scraper.minDelayMs;
    const max = env.scraper.maxDelayMs;
    const ms = min + Math.floor(Math.random() * (max - min));
    return new Promise((r) => setTimeout(r, ms));
  }
};

const PLATFORM = 'facebook';
const profileUrl = (slug) => `https://www.facebook.com/${slug}/`;

// ===== HTML field extraction =================================================
// FB inlines page bootstrap data in <script> tags as JSON. Different surfaces
// expose the same field under different names depending on the rollout
// state, so each helper tries multiple shapes.
const firstInt = (...candidates) => {
  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  }
  return 0;
};

const extractFromHtml = (html) => {
  // OG meta — present on every public page render, even logged-out states.
  const og = (prop) => html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`))?.[1] || null;
  const ogTitle       = og('og:title');
  const ogDescription = og('og:description');
  const ogImage       = og('og:image');
  const ogUrl         = og('og:url');

  // Inline JSON fields — try several names FB has used for Page count metrics.
  const followerCount = firstInt(
    html.match(/"follower_count"\s*:\s*(\d+)/)?.[1],
    html.match(/"page_followers_count"\s*:\s*(\d+)/)?.[1],
    html.match(/"new_like_count"\s*:\s*(\d+)/)?.[1],
    html.match(/"page_likers"\s*:\s*\{\s*"global_likers_count"\s*:\s*(\d+)/)?.[1],
  );
  const likeCount = firstInt(
    html.match(/"page_likers_count"\s*:\s*(\d+)/)?.[1],
    html.match(/"like_count"\s*:\s*(\d+)/)?.[1],
  );

  const isVerified = /"is_verified"\s*:\s*true/.test(html) || /"verification_status"\s*:\s*"\s*BLUE_VERIFIED/.test(html);

  const pageId = html.match(/"page_id"\s*:\s*"(\d+)"/)?.[1] || html.match(/"profile_id"\s*:\s*"(\d+)"/)?.[1] || null;

  const externalUrl = (() => {
    const m = html.match(/"website"\s*:\s*"([^"]+)"/) || html.match(/"contact_options"\s*:[^}]*"url"\s*:\s*"([^"]+)"/);
    return m ? m[1].replace(/\\\//g, '/') : null;
  })();

  return { ogTitle, ogDescription, ogImage, ogUrl, followerCount, likeCount, isVerified, pageId, externalUrl };
};

// ===== HTTP-first scrape path ================================================
const isLoginRedirect = (res, html) => {
  if (res.status === 302 || res.status === 303) {
    const loc = res.headers.get('location') || '';
    if (/\/login|\/checkpoint/i.test(loc)) return true;
  }
  if (/login.php|checkpoint/i.test(res.url)) return true;
  // Logged-out HTML usually hits a "You must log in to continue" string.
  if (/You must log in to continue/i.test(html)) return true;
  return false;
};

async function scrapeViaHttp(slug) {
  const url = profileUrl(slug);
  const headers = buildFbHtmlHeaders({ referer: 'https://www.google.com/' });

  let res;
  try {
    res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    const e = new Error(`fb HTTP fetch failed: ${err.message}`);
    e.code = 'HTTP_THREW';
    throw e;
  }

  // Lightweight response sniff.
  const html = await res.text();

  if (res.status === 404 || /This Page Isn'?t Available|Sorry, this content isn'?t available/i.test(html)) {
    const e = new Error(`Page ${slug} not found`);
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (isLoginRedirect(res, html)) {
    const e = new Error('Facebook login wall — set FB_COOKIES env to authenticate.');
    e.code = 'BLOCKED';
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`fb HTTP ${res.status}`);
    e.code = `HTTP_${res.status}`;
    throw e;
  }

  const fields = extractFromHtml(html);

  // Sanity check — if we got literally nothing useful, treat as blocked.
  if (!fields.ogTitle && !fields.followerCount && !fields.pageId) {
    const e = new Error('Facebook extraction failed — likely soft-blocked or layout changed.');
    e.code = 'EXTRACTION_FAILED';
    throw e;
  }

  return {
    platform: PLATFORM,
    username: slug,
    fullName: fields.ogTitle?.replace(/\s*\|\s*Facebook$/, '').replace(/\s*-\s*Facebook$/, '') || null,
    bio: fields.ogDescription || null,
    profilePicUrl: fields.ogImage || null,
    externalUrl: fields.externalUrl,
    isVerified: fields.isVerified,
    followers: fields.followerCount || 0,
    following: 0, // FB Pages don't expose a following count.
    postsCount: 0, // FB doesn't surface a post-count number on Page headers.
    totalLikes: fields.likeCount ? parseCount(String(fields.likeCount)) : null,
    posts: [],
    platformUserId: fields.pageId || null,
  };
}

// ===== Playwright fallback ===================================================
// Kept around for the rare anonymous case where m.facebook.com still serves
// public Pages without a login wall. Slow and unreliable but better than a
// hard fail when no FB_COOKIES are configured.
async function scrapeViaPlaywright(slug) {
  const { launchContext } = browserMod();
  const { extractMeta, parseCountsFromText } = extractorMod();
  const { browser, context, proxy } = await launchContext();
  const page = await context.newPage();
  try {
    if (proxy) logger.debug({ platform: PLATFORM, proxy: proxy.server }, 'using proxy');

    await page.goto(`https://m.facebook.com/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);

    const url = page.url();
    if (/\/login\/?(\?|$)/i.test(url) || /checkpoint/i.test(url)) {
      const err = new Error('Facebook login wall — anonymous access blocked');
      err.code = 'BLOCKED';
      throw err;
    }

    const meta = await extractMeta(page);
    if (/page not found/i.test(meta.title || '')) {
      const err = new Error(`Page ${slug} not found`);
      err.code = 'NOT_FOUND';
      throw err;
    }

    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 8000));
    const counts = parseCountsFromText(bodyText, {
      followers: '(?:people follow this|followers?)',
      likes: '(?:people like this|likes?)',
    });

    if (!counts.followers && !meta.ogImage) {
      const err = new Error('Facebook extraction failed — likely blocked');
      err.code = 'EXTRACTION_FAILED';
      throw err;
    }

    return {
      platform: PLATFORM,
      username: slug,
      fullName: meta.ogTitle?.replace(/\s*-\s*Facebook$/, '') || meta.title || null,
      bio: meta.ogDescription || null,
      profilePicUrl: meta.ogImage || null,
      externalUrl: null,
      isVerified: /verified/i.test(bodyText),
      followers: counts.followers || 0,
      following: 0,
      postsCount: 0,
      totalLikes: counts.likes ? parseCount(counts.likes) : null,
      posts: [],
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ===== Public entrypoint =====================================================
async function scrapeOnce(slug) {
  const hasAuth = !!env.scraper.fbCookies;

  if (hasAuth) {
    try {
      logger.info({ platform: PLATFORM, username: slug, path: 'http' }, 'scraping via authenticated HTTP');
      return await scrapeViaHttp(slug);
    } catch (err) {
      // NOT_FOUND is terminal; for anything else we try Playwright as a last
      // resort (sometimes catches edge cases like rate-limited HTTP).
      if (err.code === 'NOT_FOUND') throw err;
      logger.warn({ platform: PLATFORM, username: slug, code: err.code, err: err.message }, 'HTTP path failed, trying Playwright');
    }
  } else {
    logger.warn({ platform: PLATFORM, username: slug }, 'no FB_COOKIES set — falling straight back to anonymous Playwright path (often blocked)');
  }

  return scrapeViaPlaywright(slug);
}

async function scrape(slug) {
  const max = env.scraper.maxRetries;
  let lastError;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      logger.info({ platform: PLATFORM, username: slug, attempt }, 'scraping');
      await randomDelay();
      return await scrapeOnce(slug);
    } catch (err) {
      lastError = err;
      logger.warn(
        { platform: PLATFORM, username: slug, attempt, err: err.message, code: err.code },
        'scrape attempt failed'
      );
      if (err.code === 'NOT_FOUND') throw err;
      if (attempt < max) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError || new Error('Unknown FB scrape failure');
}

const normalizePosts = () => [];

module.exports = { platform: PLATFORM, profileUrl, scrape, normalizePosts };
