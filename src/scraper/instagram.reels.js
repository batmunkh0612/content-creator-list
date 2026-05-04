'use strict';

const logger = require('../utils/logger');
const prisma = require('../prisma/client');
const { buildIgHeaders } = require('./instagram.headers');
const { pickSession, markCold } = require('./ig.pool');

// IG's reels-tab endpoint. Same v1/clips path the web app calls when you
// open the Reels tab on a profile. Cursor pagination via `max_id`. Returns
// items shaped as `{ media: { play_count, like_count, comment_count, ... } }`.
const REELS_URL = 'https://www.instagram.com/api/v1/clips/user/';
const PAGE_SIZE = 12;
const PAGE_DELAY_MIN_MS = 1500;
const PAGE_DELAY_MAX_MS = 3500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  PAGE_DELAY_MIN_MS + Math.floor(Math.random() * (PAGE_DELAY_MAX_MS - PAGE_DELAY_MIN_MS));
const parseCount = (n) => (typeof n === 'number' ? n : 0);

const mapReel = (item) => {
  const m = item?.media || item;
  if (!m) return null;
  const code = m.code || m.shortcode || null;
  const ts = m.taken_at;
  return {
    shortcode: code,
    likes: parseCount(m.like_count),
    comments: parseCount(m.comment_count),
    views:
      typeof m.play_count === 'number'       ? m.play_count :
      typeof m.view_count === 'number'       ? m.view_count :
      typeof m.video_view_count === 'number' ? m.video_view_count :
      null,
    caption: m.caption?.text || null,
    postedAt: ts ? new Date(ts * 1000) : null,
    mediaType: 'reel',
    mediaUrl: m.image_versions2?.candidates?.[0]?.url || null,
    permalink: code ? `https://www.instagram.com/reel/${code}/` : null,
  };
};

const upsertReels = async (influencerId, items) => {
  for (const r of items) {
    if (!r?.shortcode) continue;
    await prisma.post.upsert({
      where: { shortcode: r.shortcode },
      create: { influencerId, ...r },
      update: {
        likes: r.likes, comments: r.comments, views: r.views,
        caption: r.caption, mediaType: r.mediaType,
        mediaUrl: r.mediaUrl, permalink: r.permalink,
      },
    }).catch((err) => {
      logger.warn({ shortcode: r.shortcode, err: err.message }, 'reel upsert failed');
    });
  }
};

const scrapeReels = async ({
  influencerId, username, userId, max = 10, startCursor = null, onProgress,
}) => {
  let session = pickSession();
  if (!session) {
    return { fetched: 0, pages: 0, blocked: true, blockedReason: 'No IG session', nextCursor: startCursor };
  }

  let cursor = startCursor || null;
  let fetched = 0;
  let pages = 0;
  let blocked = false;
  let blockedReason = null;

  while (fetched < max) {
    pages += 1;

    let headers;
    try {
      headers = buildIgHeaders({
        referer: `https://www.instagram.com/${username}/reels/`,
        session,
      });
    } catch (err) {
      blocked = true; blockedReason = err.message;
      break;
    }
    headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const body = new URLSearchParams({
      target_user_id: String(userId),
      page_size: String(PAGE_SIZE),
      include_feed_video: 'true',
    });
    if (cursor) body.set('max_id', cursor);

    let res;
    try {
      res = await fetch(REELS_URL, {
        method: 'POST',
        headers,
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      logger.warn({ username, page: pages, err: err.message }, 'reels fetch threw');
      blocked = true; blockedReason = `network: ${err.message}`;
      break;
    }

    if (res.status === 429) {
      markCold(session?.id);
      const next = pickSession();
      if (next && next.id !== session?.id) {
        session = next; pages -= 1; continue;
      }
      blocked = true; blockedReason = 'HTTP 429 — all sessions cooling';
      break;
    }
    if ([401, 403].includes(res.status)) {
      blocked = true; blockedReason = `HTTP ${res.status}`;
      break;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      blocked = true; blockedReason = `HTTP ${res.status}: ${t.slice(0, 80)}`;
      break;
    }

    let json;
    try { json = await res.json(); }
    catch { blocked = true; blockedReason = 'non-json'; break; }

    const items = Array.isArray(json?.items) ? json.items : [];
    if (!items.length) break;

    const batch = items.slice(0, max - fetched).map(mapReel).filter(Boolean);
    if (batch.length) await upsertReels(influencerId, batch);

    fetched += batch.length;
    if (typeof onProgress === 'function') {
      await onProgress({ fetched, lastBatch: batch.length, pages, sessionId: session?.id });
    }

    cursor = json?.paging_info?.max_id || json?.next_max_id || null;
    const more = json?.paging_info?.more_available !== false;
    if (!cursor || !more) break;
    if (fetched >= max) break;
    await sleep(jitter());
  }

  return { fetched, pages, blocked, blockedReason, nextCursor: cursor };
};

module.exports = { scrapeReels };
