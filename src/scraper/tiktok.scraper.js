'use strict';

const { launchContext, randomDelay } = require('./browser');
const { parseCount, trimCaption } = require('../utils/normalize');
const { extractMeta, findInJson } = require('./_extractor');
const logger = require('../utils/logger');
const env = require('../config/env');

const PLATFORM = 'tiktok';
const profileUrl = (u) => `https://www.tiktok.com/@${u.replace(/^@/, '')}`;

// Pull the rehydration blob TikTok ships in a single big script tag.
async function extractRehydration(page) {
  return page.evaluate(() => {
    const el = document.querySelector('script[id="__UNIVERSAL_DATA_FOR_REHYDRATION__"]');
    if (!el?.textContent) return null;
    try { return JSON.parse(el.textContent); } catch { return null; }
  });
}

async function scrapeOnce(handle) {
  const { browser, context, proxy } = await launchContext();
  const page = await context.newPage();

  try {
    if (proxy) logger.debug({ platform: PLATFORM, proxy: proxy.server }, 'using proxy');

    await page.goto(profileUrl(handle), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(2000);

    const [blob, meta] = await Promise.all([
      extractRehydration(page),
      extractMeta(page),
    ]);

    // TikTok's "user-detail" namespace is the canonical source.
    const userInfo =
      blob?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo ||
      findInJson(blob, (n) => n?.user && n?.stats?.followerCount !== undefined);

    if (!userInfo) {
      // Fall back to OG meta — TikTok publishes follower count in the
      // og:description for some profiles even when the rehydration blob is
      // missing or ratelimited.
      const fromMeta = parseCountsFallback(meta);
      if (!fromMeta.followers && !meta.ogImage) {
        const err = new Error('TikTok extraction failed — likely rate limited');
        err.code = 'EXTRACTION_FAILED';
        throw err;
      }
      return {
        platform: PLATFORM,
        username: handle.replace(/^@/, ''),
        fullName: meta.ogTitle?.replace(/\s*\(@.*$/, '') || null,
        bio: meta.ogDescription || null,
        profilePicUrl: meta.ogImage,
        externalUrl: null,
        isVerified: false,
        followers: fromMeta.followers || 0,
        following: fromMeta.following || 0,
        postsCount: 0,
        posts: [],
      };
    }

    const u = userInfo.user || {};
    const s = userInfo.stats || userInfo.statsV2 || {};

    // Item list (latest videos) — present on some renderings.
    const itemList = blob?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.itemList || [];
    const posts = (itemList || []).slice(0, 12).map((it) => ({
      shortcode: it.id || null,
      caption: it.desc || null,
      likes: it.stats?.diggCount ?? 0,
      comments: it.stats?.commentCount ?? 0,
      views: it.stats?.playCount ?? 0,
      shares: it.stats?.shareCount ?? 0,
      mediaType: 'video',
      mediaUrl: it.video?.cover || it.video?.dynamicCover || null,
      permalink: it.id
        ? `https://www.tiktok.com/@${u.uniqueId || handle}/video/${it.id}`
        : null,
      postedAt: it.createTime
        ? new Date(it.createTime * 1000).toISOString()
        : null,
    }));

    return {
      platform: PLATFORM,
      username: u.uniqueId || handle.replace(/^@/, ''),
      fullName: u.nickname || null,
      bio: u.signature || null,
      profilePicUrl: u.avatarLarger || u.avatarMedium || u.avatarThumb || meta.ogImage || null,
      externalUrl: u.bioLink?.link || null,
      isVerified: Boolean(u.verified),
      followers: parseCount(s.followerCount ?? s.fans),
      following: parseCount(s.followingCount),
      postsCount: parseCount(s.videoCount),
      totalLikes: parseCount(s.heart ?? s.heartCount),
      posts,
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function parseCountsFallback(meta) {
  const text = meta.ogDescription || meta.description || '';
  const out = {};
  const f = text.match(/([\d.,]+\s*[KMB]?)\s+Followers/i);
  const g = text.match(/([\d.,]+\s*[KMB]?)\s+Following/i);
  if (f) out.followers = parseCount(f[1]);
  if (g) out.following = parseCount(g[1]);
  return out;
}

async function scrape(handle) {
  const max = env.scraper.maxRetries;
  let lastError;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      logger.info({ platform: PLATFORM, username: handle, attempt }, 'scraping');
      await randomDelay();
      return await scrapeOnce(handle);
    } catch (err) {
      lastError = err;
      logger.warn(
        { platform: PLATFORM, username: handle, attempt, err: err.message, code: err.code },
        'scrape attempt failed'
      );
      if (err.code === 'NOT_FOUND') throw err;
      if (attempt < max) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError || new Error('Unknown scrape failure');
}

function normalizePosts(posts) {
  return (posts || []).slice(0, 12).map((p) => ({
    shortcode: p.shortcode,
    likes: parseCount(p.likes),
    comments: parseCount(p.comments),
    views: parseCount(p.views),
    shares: parseCount(p.shares),
    caption: trimCaption(p.caption),
    postedAt: p.postedAt ? new Date(p.postedAt) : null,
    mediaType: p.mediaType,
    mediaUrl: p.mediaUrl,
    permalink: p.permalink,
  }));
}

module.exports = { platform: PLATFORM, profileUrl, scrape, normalizePosts };
