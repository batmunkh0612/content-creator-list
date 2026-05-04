'use strict';

const logger = require('../utils/logger');
const prisma = require('../prisma/client');
const { parseCount } = require('../utils/normalize');
const yt = require('./youtube.scraper');
const { enrichWithStats } = require('./youtube.video');

// YouTube's InnerTube API powers every web/mobile client. We hit the same
// `/youtubei/v1/browse` endpoint the channel page itself uses for its
// "load more" requests — pagination is via opaque `continuation` tokens
// the previous response carried. No auth required for public channels.
const INNERTUBE_URL = (apiKey) =>
  `https://www.youtubei.googleapis.com/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}&prettyPrint=false`;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const PAGE_DELAY_MIN_MS = 800;
const PAGE_DELAY_MAX_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  PAGE_DELAY_MIN_MS + Math.floor(Math.random() * (PAGE_DELAY_MAX_MS - PAGE_DELAY_MIN_MS));

const upsertVideos = async (influencerId, items) => {
  for (const v of items) {
    if (!v?.shortcode) continue;
    await prisma.post.upsert({
      where: { shortcode: v.shortcode },
      create: { influencerId, ...v },
      update: {
        likes: v.likes, comments: v.comments, views: v.views,
        caption: v.caption, mediaType: v.mediaType,
        mediaUrl: v.mediaUrl, permalink: v.permalink,
      },
    }).catch((err) => {
      logger.warn({ shortcode: v.shortcode, err: err.message }, 'YT post upsert failed');
    });
  }
};

// Bootstrap the first page from the channel's HTML so we can extract the
// InnerTube key + initial continuation token. After that we paginate
// purely via /youtubei/v1/browse using the cached key.
const bootstrap = async (username) => {
  const html = await yt.__internal.fetchChannelHtml(username, 'videos');
  const data = yt.__internal.extractYtInitialData(html);
  const ctx = yt.__internal.extractInnerTubeContext(html);
  if (!ctx.apiKey) {
    const e = new Error('Could not extract InnerTube API key from channel HTML');
    e.code = 'NO_INNERTUBE_KEY';
    throw e;
  }
  const videosNode = yt.__internal.findVideoListRenderer(data);
  const items = (videosNode?.contents || []).map(yt.__internal.mapVideoNode).filter(Boolean);
  const continuationToken = videosNode?.contents?.find((c) =>
    c?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
  )?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;

  return { apiKey: ctx.apiKey, clientVersion: ctx.clientVersion, items, continuationToken };
};

// Continuation request — same payload shape the YT web client sends.
const fetchContinuation = async ({ apiKey, clientVersion, continuation }) => {
  const body = JSON.stringify({
    context: {
      client: {
        hl: 'en', gl: 'US',
        clientName: 'WEB',
        clientVersion,
        userAgent: UA,
        platform: 'DESKTOP',
      },
    },
    continuation,
  });

  const res = await fetch(INNERTUBE_URL(apiKey), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': UA,
      'origin': 'https://www.youtube.com',
      'referer': 'https://www.youtube.com/',
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error(`youtubei browse HTTP ${res.status}: ${t.slice(0, 80)}`);
    e.code = `HTTP_${res.status}`;
    throw e;
  }
  return res.json();
};

// Pull the next batch of videos + the next continuation out of the
// /youtubei/v1/browse response. The shape is:
//   onResponseReceivedActions[].appendContinuationItemsAction.continuationItems[]
// Each item is either a richItemRenderer (video) or a continuationItemRenderer
// (the new token).
const pickContinuationItems = (json) => {
  const actions =
    json?.onResponseReceivedActions ||
    json?.onResponseReceivedEndpoints ||
    [];
  for (const a of actions) {
    const list =
      a?.appendContinuationItemsAction?.continuationItems ||
      a?.reloadContinuationItemsCommand?.continuationItems;
    if (Array.isArray(list)) return list;
  }
  return [];
};

const scrapeVideos = async ({
  influencerId, username, max = 10, startCursor = null, onProgress,
}) => {
  let fetched = 0;
  let pages = 0;
  let blocked = false;
  let blockedReason = null;
  let continuation = startCursor || null;

  // Cached InnerTube context — populated by bootstrap on first call.
  let apiKey = null;
  let clientVersion = '2.20240101.00.00';

  // First page: if there's no saved cursor, take it straight from the
  // channel HTML (saves us a round-trip and gives us the bootstrap context).
  if (!continuation) {
    let boot;
    try { boot = await bootstrap(username); }
    catch (err) {
      logger.warn({ username, err: err.message }, 'YT bootstrap failed');
      return { fetched: 0, pages: 0, blocked: true, blockedReason: err.message, nextCursor: null };
    }
    apiKey = boot.apiKey;
    clientVersion = boot.clientVersion;
    continuation = boot.continuationToken;

    const batch = boot.items.slice(0, max);
    if (batch.length) {
      // Enrich first so the upsert lands real likes/comments instead of zero.
      await enrichWithStats(batch, { concurrency: 3 }).catch(() => {});
      await upsertVideos(influencerId, batch);
    }
    fetched += batch.length;
    pages += 1;
    if (typeof onProgress === 'function') {
      await onProgress({ fetched, lastBatch: batch.length, pages });
    }
    if (fetched >= max || !continuation) {
      return { fetched, pages, blocked: false, blockedReason: null, nextCursor: continuation };
    }
    await sleep(jitter());
  } else {
    // Continuation-only path: still need apiKey. Bootstrap silently —
    // discards the items since we want only what's past the cursor.
    try {
      const boot = await bootstrap(username);
      apiKey = boot.apiKey;
      clientVersion = boot.clientVersion;
    } catch (err) {
      return { fetched: 0, pages: 0, blocked: true, blockedReason: err.message, nextCursor: continuation };
    }
  }

  while (fetched < max && continuation && apiKey) {
    pages += 1;
    let json;
    try {
      json = await fetchContinuation({ apiKey, clientVersion, continuation });
    } catch (err) {
      blocked = true; blockedReason = err.message; break;
    }

    const items = pickContinuationItems(json);
    const videos = items.map(yt.__internal.mapVideoNode).filter(Boolean);
    if (!videos.length) break;

    const batch = videos.slice(0, max - fetched);
    if (batch.length) {
      await enrichWithStats(batch, { concurrency: 3 }).catch(() => {});
      await upsertVideos(influencerId, batch);
    }
    fetched += batch.length;

    if (typeof onProgress === 'function') {
      await onProgress({ fetched, lastBatch: batch.length, pages });
    }

    // Find the next cursor — last continuationItemRenderer in this batch.
    const nextItem = items.find((c) =>
      c?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
    );
    continuation = nextItem?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;
    if (!continuation) break;
    if (fetched >= max) break;
    await sleep(jitter());
  }

  return { fetched, pages, blocked, blockedReason, nextCursor: continuation };
};

module.exports = { scrapeVideos };
