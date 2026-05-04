'use strict';

const logger = require('../utils/logger');
const prisma = require('../prisma/client');
const { buildIgHeaders } = require('./instagram.headers');
const { pickSession, markCold } = require('./ig.pool');
const graph = require('../services/graph.service');

// Mirrors instagram.followers.js but hits the /following/ path and
// persists into the `following` table + mirrors edges into Neo4j.

const PAGE_SIZE = 100;
const SEARCH_SURFACE = 'follow_list_page';
const PAGE_DELAY_MIN_MS = 1500;
const PAGE_DELAY_MAX_MS = 3500;

const DEFAULT_MAX = Number(process.env.IG_FOLLOWING_MAX || process.env.IG_FOLLOWERS_MAX || 10_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  PAGE_DELAY_MIN_MS + Math.floor(Math.random() * (PAGE_DELAY_MAX_MS - PAGE_DELAY_MIN_MS));

async function scrapeFollowing({
  influencerId,
  username,
  userId,
  max = DEFAULT_MAX,
  startCursor = null,
  onProgress,
}) {
  let session = pickSession();
  // Resume from the persisted IG `next_max_id` so each "fetch N more" click
  // walks deeper into the following list instead of restarting from page 1.
  let cursor = startCursor || null;
  let fetched = 0;
  let pages = 0;
  let blocked = false;
  let blockedReason = null;

  while (fetched < max) {
    pages += 1;

    const params = new URLSearchParams({
      count: String(PAGE_SIZE),
      search_surface: SEARCH_SURFACE,
    });
    if (cursor) params.set('max_id', cursor);
    const url =
      `https://www.instagram.com/api/v1/friendships/${userId}/following/?${params.toString()}`;

    const headers = buildIgHeaders({
      referer: `https://www.instagram.com/${username}/following/`,
      session,
    });

    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      logger.warn({ username, page: pages, err: err.message }, 'following fetch threw');
      blocked = true; blockedReason = `network: ${err.message}`;
      break;
    }

    if (res.status === 429) {
      markCold(session?.id);
      const next = pickSession();
      if (next && next.id !== session?.id) {
        logger.info(
          { username, page: pages, from: session?.id, to: next.id },
          'rotating to fresh session after 429'
        );
        session = next;
        pages -= 1;
        continue;
      }
      blocked = true; blockedReason = 'HTTP 429 — all sessions cooling';
      break;
    }

    if ([401, 403].includes(res.status)) {
      blocked = true; blockedReason = `HTTP ${res.status}`;
      break;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      blocked = true; blockedReason = `HTTP ${res.status}: ${body.slice(0, 80)}`;
      logger.warn({ username, page: pages, status: res.status, body: body.slice(0, 200) }, 'following non-2xx');
      break;
    }

    let json;
    try { json = await res.json(); }
    catch { blocked = true; blockedReason = 'non-json'; break; }

    const users = Array.isArray(json?.users) ? json.users : [];
    if (!users.length) break;

    const batch = users.slice(0, max - fetched).map((u) => ({
      influencerId,
      username: u.username,
      fullName: u.full_name || null,
      profilePicUrl: u.profile_pic_url || null,
      isVerified: !!u.is_verified,
      isPrivate: !!u.is_private,
    }));

    if (batch.length) {
      try {
        await prisma.following.createMany({ data: batch, skipDuplicates: true });
      } catch (err) {
        logger.warn({ username, err: err.message }, 'following persist failed');
      }
      graph.mirrorFollowing('instagram', username, batch).catch(() => {});
    }

    fetched += batch.length;
    if (typeof onProgress === 'function') {
      await onProgress({ fetched, blocked: false, lastBatch: batch.length, pages, sessionId: session?.id });
    }

    cursor = json?.next_max_id || null;
    if (!cursor) break;
    if (fetched >= max) break;
    await sleep(jitter());
  }

  return { fetched, pages, blocked, blockedReason, nextCursor: cursor };
}

module.exports = { scrapeFollowing, DEFAULT_MAX };
