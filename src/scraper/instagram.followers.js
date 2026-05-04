'use strict';

const logger = require('../utils/logger');
const prisma = require('../prisma/client');
const { buildIgHeaders } = require('./instagram.headers');
const { pickSession, markCold } = require('./ig.pool');
const graph = require('../services/graph.service');

const PAGE_SIZE = 100;
const SEARCH_SURFACE = 'follow_list_page';
const PAGE_DELAY_MIN_MS = 1500;
const PAGE_DELAY_MAX_MS = 3500;

const DEFAULT_MAX = Number(process.env.IG_FOLLOWERS_MAX || 10_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  PAGE_DELAY_MIN_MS + Math.floor(Math.random() * (PAGE_DELAY_MAX_MS - PAGE_DELAY_MIN_MS));

/**
 * Resolve the profile's `pk` (IG's numeric user id) via web_profile_info.
 * Uses a pool session; rotates once on 429.
 */
async function resolvePlatformUserId(username) {
  let session = pickSession();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = buildIgHeaders({
      referer: `https://www.instagram.com/${username}/`,
      session,
    });

    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers, signal: AbortSignal.timeout(12_000) }
    );

    if (res.status === 404) {
      const err = new Error(`Profile @${username} not found`);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (res.status === 429) {
      markCold(session?.id);
      const next = pickSession();
      if (next && next.id !== session?.id) {
        session = next;
        continue; // retry once with the next session
      }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`web_profile_info HTTP ${res.status}: ${body.slice(0, 100)}`);
      err.code = 'API_BLOCKED';
      throw err;
    }
    const json = await res.json();
    const u = json?.data?.user;
    if (!u?.id && !u?.pk) {
      const err = new Error('No user.id in web_profile_info response');
      err.code = 'EXTRACTION_FAILED';
      throw err;
    }
    return {
      userId: String(u.id || u.pk),
      sessionId: session?.id,
      profile: {
        username: u.username,
        fullName: u.full_name,
        profilePicUrl: u.profile_pic_url_hd || u.profile_pic_url,
        isVerified: !!u.is_verified,
        followers: u.edge_followed_by?.count || 0,
      },
    };
  }
  // Both attempts hit 429
  const err = new Error('All sessions rate-limited (429) when resolving user id');
  err.code = 'API_BLOCKED';
  throw err;
}

/**
 * Page Instagram's followers endpoint until we hit:
 *   - the requested cap, or
 *   - end of pagination (no next_max_id), or
 *   - a 401/403/429 with no fresh session left.
 *
 * Per-page persistence to Postgres + Neo4j mirror.
 */
async function scrapeFollowers({
  influencerId,
  username,
  userId,
  max = DEFAULT_MAX,
  startCursor = null,
  onProgress,
}) {
  let session = pickSession();
  // Resume from the persisted IG `next_max_id` so each "fetch N more" click
  // walks deeper into the followers list instead of restarting from page 1.
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
      `https://www.instagram.com/api/v1/friendships/${userId}/followers/?${params.toString()}`;

    const headers = buildIgHeaders({
      referer: `https://www.instagram.com/${username}/followers/`,
      session,
    });

    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      logger.warn({ username, page: pages, err: err.message }, 'followers fetch threw');
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
        pages -= 1; // don't count the failed attempt
        continue;
      }
      blocked = true; blockedReason = `HTTP 429 — all sessions cooling`;
      break;
    }

    if ([401, 403].includes(res.status)) {
      blocked = true; blockedReason = `HTTP ${res.status}`;
      break;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      blocked = true; blockedReason = `HTTP ${res.status}: ${body.slice(0, 80)}`;
      logger.warn({ username, page: pages, status: res.status, body: body.slice(0, 200) }, 'followers non-2xx');
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
        await prisma.follower.createMany({ data: batch, skipDuplicates: true });
      } catch (err) {
        logger.warn({ username, err: err.message }, 'follower persist failed');
      }
      // Mirror to Neo4j (best-effort, non-blocking on failure).
      graph.mirrorFollowers('instagram', username, batch).catch(() => {});
    }

    fetched += batch.length;
    if (typeof onProgress === 'function') {
      await onProgress({ fetched, blocked: false, lastBatch: batch.length, pages, sessionId: session?.id });
    }

    cursor = json?.next_max_id || null;
    // Hitting the cap stops the loop, but we still want to return the
    // cursor so the next batch can resume from here.
    if (!cursor) break;
    if (fetched >= max) break;
    await sleep(jitter());
  }

  return { fetched, pages, blocked, blockedReason, nextCursor: cursor };
}

module.exports = {
  resolvePlatformUserId,
  scrapeFollowers,
  DEFAULT_MAX,
};
