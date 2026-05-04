'use strict';

const logger = require('../utils/logger');
const env = require('../config/env');
const { parseCount, trimCaption } = require('../utils/normalize');
const { enrichWithStats } = require('./youtube.video');

const PLATFORM = 'youtube';

// Playwright is only required for the fallback path — lazy-load so the
// HTTP path runs without it and so the smoke tests don't need the native
// dep installed locally.
let _browser, _extractor;
const browserMod   = () => (_browser   ||= require('./browser'));
const extractorMod = () => (_extractor ||= require('./_extractor'));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const profileUrl = (handle) => {
  if (handle.startsWith('channel/')) return `https://www.youtube.com/${handle}`;
  return `https://www.youtube.com/@${handle.replace(/^@/, '')}`;
};

// YouTube renders counts as "20.9M subscribers", "1.8K videos", "2,054,210 views".
// Our shared `parseCount()` only takes a numeric/K/M/B token, so strip the
// trailing word before handing it off.
const stripCountSuffix = (s) => {
  if (!s) return s;
  return String(s).replace(/\s+(subscribers?|views?|videos?|watching|streamed)$/i, '').trim();
};
const yp = (s) => parseCount(stripCountSuffix(s));

// ===== JSON tree helpers (same intent as the v1 scraper, bug-fixed) ==========
const header = (data) => (
  data?.header?.c4TabbedHeaderRenderer ||
  data?.header?.pageHeaderRenderer ||
  null
);

const metadataRenderer = (data) => data?.metadata?.channelMetadataRenderer || null;

const topAvatar = (h) => {
  const list =
    h?.avatar?.thumbnails ||
    h?.content?.pageHeaderViewModel?.image?.contentPreviewImageViewModel?.image?.sources ||
    [];
  if (!list.length) return null;
  return list.reduce((a, b) => ((a?.width || 0) >= (b?.width || 0) ? a : b))?.url || null;
};

// Walk a JSON tree looking for the first node whose `contents` array carries
// video items. YouTube has two coexisting shapes:
//   - Legacy: `richItemRenderer.content.videoRenderer` or `gridVideoRenderer`
//   - New (rolled out 2025): `richItemRenderer.content.lockupViewModel`
const findVideoListRenderer = (data, maxDepth = 30) => {
  const isVideoItem = (c) =>
    c?.gridVideoRenderer ||
    c?.richItemRenderer?.content?.videoRenderer ||
    c?.richItemRenderer?.content?.lockupViewModel;
  const stack = [{ n: data, d: 0 }];
  const seen = new WeakSet();
  while (stack.length) {
    const { n, d } = stack.pop();
    if (!n || typeof n !== 'object' || seen.has(n) || d > maxDepth) continue;
    seen.add(n);
    if (Array.isArray(n.contents) && n.contents.some(isVideoItem)) {
      return n;
    }
    for (const k of Object.keys(n)) stack.push({ n: n[k], d: d + 1 });
  }
  return null;
};

// Pick the largest thumbnail URL out of a sources/thumbnails list (different
// shape names but same intent across legacy and lockup view models).
const largestThumb = (sources) => {
  if (!Array.isArray(sources) || !sources.length) return null;
  return sources.reduce((a, b) => ((a?.width || 0) >= (b?.width || 0) ? a : b))?.url || null;
};

const mapLockupVideo = (lvm) => {
  const id = lvm.contentId;
  if (!id) return null;
  if (lvm.contentType && !/VIDEO|SHORT/.test(lvm.contentType)) return null; // skip playlists/podcasts
  const meta = lvm.metadata?.lockupMetadataViewModel || {};
  const titleText = meta.title?.content || null;
  const rows = meta.metadata?.contentMetadataViewModel?.metadataRows || [];
  // Row 0 typically: ["6.5M views", "5 months ago"]
  const r0 = rows[0]?.metadataParts || [];
  const viewText = r0[0]?.text?.content || null;
  const publishedText = r0[1]?.text?.content || null;
  return {
    shortcode: id,
    caption: titleText,
    views: yp(viewText),
    likes: 0,
    comments: 0,
    mediaType: /SHORT/.test(lvm.contentType || '') ? 'short' : 'video',
    mediaUrl: largestThumb(lvm.contentImage?.thumbnailViewModel?.image?.sources),
    permalink: `https://www.youtube.com/watch?v=${id}`,
    postedAt: null,
    _publishedText: publishedText,
  };
};

const mapLegacyVideo = (v) => {
  const id = v.videoId;
  if (!id) return null;
  const viewText = v.viewCountText?.simpleText || v.viewCountText?.runs?.[0]?.text || null;
  const publishedText = v.publishedTimeText?.simpleText || null;
  return {
    shortcode: id,
    caption: v.title?.runs?.[0]?.text || v.title?.simpleText || null,
    views: yp(viewText),
    likes: 0,
    comments: 0,
    mediaType: 'video',
    mediaUrl: v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null,
    permalink: `https://www.youtube.com/watch?v=${id}`,
    postedAt: null,
    _publishedText: publishedText,
  };
};

// Map any video container node (legacy or new lockup shape) to our schema.
const mapVideoNode = (c) => {
  const lockup = c?.richItemRenderer?.content?.lockupViewModel || c?.lockupViewModel;
  if (lockup) return mapLockupVideo(lockup);
  const legacy = c?.gridVideoRenderer || c?.richItemRenderer?.content?.videoRenderer;
  if (legacy) return mapLegacyVideo(legacy);
  return null;
};

// Verified-badge presence walks the new pageHeaderViewModel layout — the
// title's `attachmentRuns` carry an icon element whose `imageName` is
// CHECK_CIRCLE_FILLED for verified channels and CHECK_CIRCLE_THICK for the
// older artist-verified style.
const isVerifiedFromHeader = (h) => {
  // Old shape (still hit on smaller channels): badges array with metadataBadgeRenderer.
  if (Array.isArray(h?.badges)) {
    if (h.badges.some((b) => /VERIFIED/i.test(b?.metadataBadgeRenderer?.style || ''))) return true;
  }
  // New shape: title.dynamicTextViewModel.text.attachmentRuns[].element...
  const runs = h?.content?.pageHeaderViewModel?.title?.dynamicTextViewModel?.text?.attachmentRuns || [];
  for (const r of runs) {
    const sources = r?.element?.type?.imageType?.image?.sources || [];
    if (sources.some((s) => /CHECK_CIRCLE/i.test(s?.clientResource?.imageName || ''))) return true;
  }
  return false;
};

// ===== HTML parse helpers ====================================================
// `ytInitialData` is the entire page-state JSON YouTube embeds on every
// channel/video render. Single source of truth for everything we need.
const extractYtInitialData = (html) => {
  const re1 = /var ytInitialData\s*=\s*({[\s\S]+?});\s*<\/script>/;
  const re2 = /ytInitialData"\]\s*=\s*({[\s\S]+?});/;
  const re3 = /ytInitialData\s*=\s*({[\s\S]+?});\s*window\["ytInitialPlayerResponse"\]/;
  const m = html.match(re1) || html.match(re2) || html.match(re3);
  if (!m) return null;
  try { return JSON.parse(m[1]); }
  catch { return null; }
};

// `ytcfg.set(...)` carries the InnerTube API key + client version we need
// to call /youtubei/v1/browse for paginated continuation.
const extractInnerTubeContext = (html) => ({
  apiKey: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || null,
  clientVersion: html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20240101.00.00',
});

// Extract OG meta in case ytInitialData fails (rare, but worth the fallback).
const extractOgMeta = (html) => {
  const og = (prop) => html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`))?.[1] || null;
  return {
    ogTitle: og('og:title'),
    ogDescription: og('og:description'),
    ogImage: og('og:image'),
    ogUrl: og('og:url'),
  };
};

// ===== HTTP-first scrape =====================================================
const fetchChannelHtml = async (handle, tab = 'videos') => {
  const url = `${profileUrl(handle)}/${tab}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      // YT serves the consent wall to EU IPs unless we set the consent cookie.
      // YES+1.en+V13 is the "I agree" form value YT itself sets after click.
      'cookie': 'CONSENT=YES+1.en+V13; SOCS=CAI',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) {
    const e = new Error(`Channel ${handle} not found`); e.code = 'NOT_FOUND'; throw e;
  }
  if (!res.ok) {
    const e = new Error(`YT HTTP ${res.status}`); e.code = `HTTP_${res.status}`; throw e;
  }
  return res.text();
};

async function scrapeViaHttp(handle) {
  const html = await fetchChannelHtml(handle, 'videos');
  const data = extractYtInitialData(html);
  if (!data) {
    const e = new Error('ytInitialData missing — page layout changed?');
    e.code = 'EXTRACTION_FAILED';
    throw e;
  }

  // YT throws "channel does not exist" into `alerts`. Surface it cleanly.
  if ((data.alerts || []).some((a) => /not.*found|doesn.*exist/i.test(JSON.stringify(a)))) {
    const e = new Error(`Channel ${handle} not found`);
    e.code = 'NOT_FOUND';
    throw e;
  }

  const h = header(data);
  const md = metadataRenderer(data);
  const og = extractOgMeta(html);

  const subText =
    h?.subscriberCountText?.simpleText ||
    h?.subscriberCountText?.runs?.[0]?.text ||
    h?.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel
      ?.metadataRows?.[1]?.metadataParts?.[0]?.text?.content ||
    null;

  const videoCountText =
    h?.videosCountText?.runs?.[0]?.text ||
    h?.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel
      ?.metadataRows?.[1]?.metadataParts?.[1]?.text?.content ||
    null;

  const videosNode = findVideoListRenderer(data);
  const posts = (videosNode?.contents || [])
    .map(mapVideoNode)
    .filter(Boolean)
    .slice(0, 12);

  // Enrich with per-video like/comment counts. Concurrency 3 keeps the call
  // cluster small enough that YT doesn't shape it. Fail-soft — if a video's
  // watch page hiccups we just leave likes/comments at 0 for that row.
  if (posts.length) {
    try { await enrichWithStats(posts, { concurrency: 3 }); }
    catch (err) { logger.warn({ err: err.message }, 'YT enrichment failed (non-fatal)'); }
  }

  // Track the InnerTube continuation token from the videos list — lets
  // posts-fetch-more pick up where the initial scrape left off.
  const continuationToken = videosNode?.contents?.find((c) =>
    c?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
  )?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;

  // Channel ID (UC...) lives on header.channelId, metadata.externalId, and
  // a few other spots — first one wins.
  const channelId =
    h?.channelId ||
    md?.externalId ||
    data?.metadata?.channelMetadataRenderer?.externalId ||
    null;

  return {
    platform: PLATFORM,
    username: handle.replace(/^@/, ''),
    fullName: md?.title || h?.title || og.ogTitle?.replace(/\s*-\s*YouTube$/, '') || null,
    bio: md?.description || og.ogDescription || null,
    profilePicUrl: topAvatar(h) || md?.avatar?.thumbnails?.slice(-1)?.[0]?.url || og.ogImage || null,
    externalUrl: md?.vanityChannelUrl || null,
    isVerified: isVerifiedFromHeader(h),
    followers: yp(subText),
    following: 0,
    postsCount: yp(videoCountText),
    posts,
    platformUserId: channelId,
    _continuationToken: continuationToken,
  };
}

// ===== Playwright fallback (rare) ============================================
async function scrapeViaPlaywright(handle) {
  const { launchContext } = browserMod();
  const { extractMeta } = extractorMod();
  const { browser, context, proxy } = await launchContext();
  const page = await context.newPage();
  try {
    if (proxy) logger.debug({ platform: PLATFORM, proxy: proxy.server }, 'using proxy');
    await page.goto(`${profileUrl(handle)}/videos`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);
    const html = await page.content();
    const meta = await extractMeta(page);
    // Re-use the same HTML parsers the HTTP path uses.
    const data = extractYtInitialData(html);
    if (!data) {
      const e = new Error('ytInitialData missing in Playwright fallback'); e.code = 'EXTRACTION_FAILED'; throw e;
    }
    const h = header(data);
    const md = metadataRenderer(data);
    const subText = h?.subscriberCountText?.simpleText || h?.subscriberCountText?.runs?.[0]?.text || null;
    const videoCountText = h?.videosCountText?.runs?.[0]?.text || null;
    const videosNode = findVideoListRenderer(data);
    const posts = (videosNode?.contents || []).map(mapVideoNode).filter(Boolean).slice(0, 12);
    return {
      platform: PLATFORM,
      username: handle.replace(/^@/, ''),
      fullName: md?.title || h?.title || null,
      bio: md?.description || null,
      profilePicUrl: topAvatar(h) || md?.avatar?.thumbnails?.slice(-1)?.[0]?.url || meta.ogImage || null,
      externalUrl: md?.vanityChannelUrl || null,
      isVerified: isVerifiedFromHeader(h),
      followers: yp(subText),
      following: 0,
      postsCount: yp(videoCountText),
      posts,
      platformUserId: h?.channelId || md?.externalId || null,
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function scrapeOnce(handle) {
  try {
    logger.info({ platform: PLATFORM, username: handle, path: 'http' }, 'scraping YT');
    return await scrapeViaHttp(handle);
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw err;
    logger.warn({ platform: PLATFORM, username: handle, err: err.message, code: err.code }, 'HTTP path failed, trying Playwright');
    return scrapeViaPlaywright(handle);
  }
}

async function scrape(handle) {
  const max = env.scraper.maxRetries;
  let lastError;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      logger.info({ platform: PLATFORM, username: handle, attempt }, 'scraping');
      const min = env.scraper.minDelayMs, mx = env.scraper.maxDelayMs;
      await new Promise((r) => setTimeout(r, min + Math.floor(Math.random() * (mx - min))));
      return await scrapeOnce(handle);
    } catch (err) {
      lastError = err;
      logger.warn({ platform: PLATFORM, username: handle, attempt, err: err.message, code: err.code }, 'YT scrape attempt failed');
      if (err.code === 'NOT_FOUND') throw err;
      if (attempt < max) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError || new Error('Unknown YT scrape failure');
}

const normalizePosts = (posts) =>
  (posts || []).slice(0, 12).map((p) => ({
    shortcode: p.shortcode,
    likes: parseCount(p.likes),
    comments: parseCount(p.comments),
    views: parseCount(p.views),
    caption: trimCaption(p.caption, 250),
    postedAt: p.postedAt ? new Date(p.postedAt) : null,
    mediaType: p.mediaType,
    mediaUrl: p.mediaUrl,
    permalink: p.permalink,
  }));

module.exports = {
  platform: PLATFORM,
  profileUrl,
  scrape,
  normalizePosts,
  // Exposed for the paginated posts scraper to reuse the parsers.
  __internal: {
    extractYtInitialData,
    extractInnerTubeContext,
    findVideoListRenderer,
    mapVideoNode,
    fetchChannelHtml,
    profileUrl,
  },
};
