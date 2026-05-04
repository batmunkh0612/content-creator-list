'use strict';

const {
  enqueueScrape,
  enqueueBulkScrapes,
  enqueueFollowers,
  enqueueBulkFollowers,
  enqueueFollowing,
  enqueueBulkFollowing,
  enqueuePosts,
  enqueueReels,
  enqueueStories,
} = require('../queue/scrape.queue');
const prisma = require('../prisma/client');
const cache = require('../services/cache.service');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const {
  PLATFORMS,
  DEFAULT_PLATFORM,
  normalizeUsername,
  isValidUsername,
} = require('../scraper/registry');

function resolvePlatform(req) {
  const p = req.params.platform || req.body.platform || req.query.platform || DEFAULT_PLATFORM;
  if (!PLATFORMS.includes(p)) throw new ApiError(400, `Unknown platform: ${p}`);
  return p;
}

async function enqueue(req, res) {
  const platform = resolvePlatform(req);
  const username = normalizeUsername(platform, req.params.username);
  if (!isValidUsername(platform, username)) {
    throw new ApiError(400, `Invalid ${platform} username: ${req.params.username}`);
  }

  let job;
  try {
    job = await enqueueScrape(username, platform);
  } catch (err) {
    // BullMQ option errors should surface as 502 with a clean message rather
    // than as an unhandled 500.
    throw new ApiError(502, `Failed to enqueue scrape: ${err.message}`);
  }

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'pending', jobId: job.id },
    update: {},
  });

  await cache.del(`influencer:${platform}:${username}`);

  res.status(202).json({
    jobId: job.id,
    platform,
    username,
    status: 'pending',
    statusUrl: `/scrape/jobs/${job.id}`,
  });
}

async function jobStatus(req, res) {
  const { id } = req.params;
  const job = await prisma.scrapeJob.findUnique({ where: { id } });
  if (!job) return res.status(404).json({ error: { message: 'Job not found' } });
  res.json(job);
}

/**
 * Bulk enqueue. Accepts either:
 *   { platform: "instagram", usernames: ["a", "b"] }
 *   { items: [{ platform: "youtube", username: "@x" }, ...] }
 *
 * The latter is the only way to mix platforms in a single batch.
 */
async function bulkEnqueue(req, res) {
  const items = [];
  const skipped = [];

  if (Array.isArray(req.body.items)) {
    for (const it of req.body.items) {
      const platform = it.platform || DEFAULT_PLATFORM;
      const username = normalizeUsername(platform, it.username);
      if (!username) continue;
      if (!isValidUsername(platform, username)) {
        skipped.push({ username: it.username, platform, reason: 'invalid_format' });
        continue;
      }
      items.push({ platform, username });
    }
  }

  if (Array.isArray(req.body.usernames)) {
    const platform = req.body.platform || DEFAULT_PLATFORM;
    if (!PLATFORMS.includes(platform)) {
      throw new ApiError(400, `Unknown platform: ${platform}`);
    }
    for (const raw of req.body.usernames) {
      const username = normalizeUsername(platform, raw);
      if (!username) continue;
      if (!isValidUsername(platform, username)) {
        skipped.push({ username: raw, platform, reason: 'invalid_format' });
        continue;
      }
      items.push({ platform, username });
    }
  }

  // De-dupe by (platform, username).
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const key = `${it.platform}:${it.username}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  if (!deduped.length) {
    throw new ApiError(400, 'No valid handles after cleanup', { skipped });
  }

  const jobs = await enqueueBulkScrapes(deduped);

  await prisma.scrapeJob.createMany({
    data: jobs.map((job, i) => ({
      id: job.id,
      platform: deduped[i].platform,
      username: deduped[i].username,
      status: 'pending',
      jobId: job.id,
    })),
    skipDuplicates: true,
  });

  await Promise.all(
    deduped.map((it) => cache.del(`influencer:${it.platform}:${it.username}`))
  );

  res.status(202).json({
    enqueued: jobs.length,
    skipped,
    jobs: jobs.map((j, i) => ({
      jobId: j.id,
      platform: deduped[i].platform,
      username: deduped[i].username,
    })),
  });
}

/**
 * Re-scrape every influencer matching an optional filter (platform +
 * staleness window). Reads handles from the DB, then funnels them through
 * the same bulk-enqueue path as the user-supplied bulk endpoint.
 *
 * Chunks the addBulk into 500-item batches so the Redis pipeline doesn't
 * balloon if someone has thousands of tracked profiles.
 */
async function refreshAll(req, res) {
  const { platform, olderThanHours = 0, limit = 1000 } = req.body || {};

  if (platform && !PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unknown platform: ${platform}`);
  }

  const where = {};
  if (platform) where.platform = platform;
  if (olderThanHours > 0) {
    const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
    // Include never-scraped rows too (lastScrapedAt is nullable).
    where.OR = [{ lastScrapedAt: null }, { lastScrapedAt: { lt: cutoff } }];
  }

  const rows = await prisma.influencer.findMany({
    where,
    select: { platform: true, username: true },
    orderBy: { lastScrapedAt: 'asc' }, // refresh stalest first
    take: limit,
  });

  if (!rows.length) {
    return res.status(202).json({
      enqueued: 0,
      total: 0,
      breakdown: {},
    });
  }

  const CHUNK = 500;
  const breakdown = {};
  const allJobs = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const jobs = await enqueueBulkScrapes(chunk);
    allJobs.push(...jobs);
    for (const r of chunk) {
      breakdown[r.platform] = (breakdown[r.platform] || 0) + 1;
    }
  }

  // Pre-create ScrapeJob rows so the dashboard's pending count ticks up
  // immediately, even before the worker pulls them.
  await prisma.scrapeJob.createMany({
    data: allJobs.map((job, i) => ({
      id: job.id,
      platform: rows[i].platform,
      username: rows[i].username,
      status: 'pending',
      jobId: job.id,
    })),
    skipDuplicates: true,
  });

  // Bust caches for every refreshed row.
  await Promise.all(
    rows.map((r) => cache.del(`influencer:${r.platform}:${r.username}`))
  );

  res.status(202).json({
    enqueued: allJobs.length,
    total: rows.length,
    breakdown,
  });
}

/**
 * Enqueue a follower-list fetch. Currently Instagram-only because YouTube
 * doesn't expose subscribers and FB/TT block anonymous lookups.
 */
async function enqueueFollowersScrape(req, res) {
  const platform = req.params.platform || DEFAULT_PLATFORM;
  const username = normalizeUsername(platform, req.params.username);

  if (platform !== 'instagram') {
    throw new ApiError(
      400,
      `Followers-list fetch is only available for Instagram (requested: ${platform}).`
    );
  }
  if (!isValidUsername(platform, username)) {
    throw new ApiError(400, `Invalid Instagram username: ${req.params.username}`);
  }

  // Refuse early when no session cookie is configured — the IG endpoint will
  // return 401 anyway, this surfaces a clearer error.
  if (!env.scraper.igSessionId) {
    throw new ApiError(
      400,
      'IG_SESSIONID is not set. Add a logged-in Instagram sessionid to .env to fetch followers.',
      ['Open instagram.com → log in (use a throwaway account) → DevTools → Application → Cookies → copy "sessionid" value into IG_SESSIONID']
    );
  }

  const inf = await prisma.influencer.findUnique({
    where: { platform_username: { platform, username } },
  });
  if (!inf) {
    throw new ApiError(
      404,
      `Influencer @${username} not yet scraped — run a profile scrape first.`
    );
  }

  const max = Math.min(
    Number(req.body?.max) || 0,
    Number(process.env.IG_FOLLOWERS_MAX || 10_000)
  ) || Number(process.env.IG_FOLLOWERS_MAX || 10_000);

  const job = await enqueueFollowers(username, platform, max);

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'pending', jobId: job.id },
    update: {},
  });

  res.status(202).json({
    jobId: job.id,
    platform,
    username,
    status: 'pending',
    max,
    statusUrl: `/scrape/jobs/${job.id}`,
  });
}

/**
 * Enqueue a follower-list fetch for EVERY tracked Instagram profile.
 * Filters: platform (locked to 'instagram' since YT/TT/FB don't support
 * the friendships endpoint), staleness, onlyMissing.
 *
 * Honest caveat surfaced to the user via the response: per-profile cap is
 * IG's server-side visibility limit (~40 for non-followed targets), not
 * something the client can move.
 */
async function refreshAllFollowers(req, res) {
  const platform = req.body.platform || 'instagram';
  if (platform !== 'instagram') {
    throw new ApiError(
      400,
      `Followers refresh is only supported for Instagram (requested: ${platform}).`
    );
  }
  if (!env.scraper.igSessionId && !env.scraper.igCookies) {
    throw new ApiError(
      400,
      'No Instagram session configured. Set IG_COOKIES (preferred) or IG_SESSIONID in .env.'
    );
  }

  const {
    olderThanHours = 0,
    onlyMissing = false,
    limit = 200,
    max,
  } = req.body || {};

  const where = { platform: 'instagram' };

  // Staleness filter — also include never-fetched rows (NULL).
  if (olderThanHours > 0) {
    const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
    where.OR = [
      { followersFetchedAt: null },
      { followersFetchedAt: { lt: cutoff } },
    ];
  }
  // onlyMissing — re-fetch profiles that have zero captured followers.
  if (onlyMissing) {
    where.followersFetched = 0;
  }

  const rows = await prisma.influencer.findMany({
    where,
    select: { platform: true, username: true, followersFetched: true },
    // Refresh oldest first so we make steady progress through the workspace.
    orderBy: [{ followersFetchedAt: 'asc' }, { username: 'asc' }],
    take: Math.min(Math.max(Number(limit) || 200, 1), 500),
  });

  if (!rows.length) {
    return res.status(202).json({
      enqueued: 0,
      total: 0,
      perProfileMax: 0,
      note: 'No matching profiles.',
    });
  }

  const perProfileMax = Math.min(
    Number(max) || 0,
    Number(process.env.IG_FOLLOWERS_MAX || 10_000)
  ) || Number(process.env.IG_FOLLOWERS_MAX || 10_000);

  const jobs = await enqueueBulkFollowers(rows, perProfileMax);

  // Pre-create ScrapeJob rows so the dashboard's pending count ticks up
  // immediately (and so each job has a row ready when the worker fires).
  await prisma.scrapeJob.createMany({
    data: jobs.map((job, i) => ({
      id: job.id,
      platform: rows[i].platform,
      username: rows[i].username,
      status: 'pending',
      jobId: job.id,
    })),
    skipDuplicates: true,
  });

  res.status(202).json({
    enqueued: jobs.length,
    total: rows.length,
    perProfileMax,
    note:
      'Per-profile capture is capped by IG visibility — for accounts the ' +
      'session does not follow, that is typically ~40. Multi-session pooling ' +
      'or pre-following the targets are the only ways to lift it.',
  });
}

/**
 * Per-profile posts fetch. Walks IG feed/user using the persisted cursor —
 * each click adds `max` more posts. Default batch is 10.
 */
async function enqueuePostsScrape(req, res) {
  const platform = req.params.platform || DEFAULT_PLATFORM;
  const username = normalizeUsername(platform, req.params.username);

  if (!['instagram', 'youtube'].includes(platform)) {
    throw new ApiError(
      400,
      `Posts fetch is only available for Instagram and YouTube (requested: ${platform}).`
    );
  }
  if (!isValidUsername(platform, username)) {
    throw new ApiError(400, `Invalid ${platform} username: ${req.params.username}`);
  }
  // YouTube's InnerTube API works without auth for public channels — the
  // session check only applies to IG, which 401s on the GraphQL endpoint
  // without authenticated cookies.
  if (platform === 'instagram' && !env.scraper.igSessionId && !env.scraper.igCookies) {
    throw new ApiError(
      400,
      'No Instagram session configured. Add one via /v2/sessions or set IG_SESSIONID/IG_COOKIES.'
    );
  }

  const inf = await prisma.influencer.findUnique({
    where: { platform_username: { platform, username } },
  });
  if (!inf) {
    throw new ApiError(
      404,
      `Influencer @${username} not yet scraped — run a profile scrape first.`
    );
  }

  const max = Math.min(Math.max(Number(req.body?.max) || 10, 1), 200);
  const job = await enqueuePosts(username, platform, max);

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'pending', jobId: job.id },
    update: {},
  });

  res.status(202).json({
    jobId: job.id,
    platform,
    username,
    status: 'pending',
    max,
    statusUrl: `/scrape/jobs/${job.id}`,
  });
}

/** Per-profile reels fetch — clips/user with cursor pagination. */
async function enqueueReelsScrape(req, res) {
  const platform = req.params.platform || DEFAULT_PLATFORM;
  const username = normalizeUsername(platform, req.params.username);

  if (platform !== 'instagram') {
    throw new ApiError(400, 'Reels fetch is Instagram-only.');
  }
  if (!isValidUsername(platform, username)) {
    throw new ApiError(400, `Invalid Instagram username: ${req.params.username}`);
  }
  if (!env.scraper.igSessionId && !env.scraper.igCookies) {
    throw new ApiError(400, 'No Instagram session configured. Add one at /v2/sessions.');
  }

  const inf = await prisma.influencer.findUnique({
    where: { platform_username: { platform, username } },
  });
  if (!inf) throw new ApiError(404, `Influencer @${username} not yet scraped.`);

  const max = Math.min(Math.max(Number(req.body?.max) || 10, 1), 200);
  const job = await enqueueReels(username, platform, max);

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'pending', jobId: job.id },
    update: {},
  });

  res.status(202).json({
    jobId: job.id, platform, username, status: 'pending', max,
    statusUrl: `/scrape/jobs/${job.id}`,
  });
}

/** Per-profile stories snapshot — one-shot, no cursor. */
async function enqueueStoriesScrape(req, res) {
  const platform = req.params.platform || DEFAULT_PLATFORM;
  const username = normalizeUsername(platform, req.params.username);

  if (platform !== 'instagram') {
    throw new ApiError(400, 'Stories fetch is Instagram-only.');
  }
  if (!isValidUsername(platform, username)) {
    throw new ApiError(400, `Invalid Instagram username: ${req.params.username}`);
  }
  if (!env.scraper.igSessionId && !env.scraper.igCookies) {
    throw new ApiError(400, 'No Instagram session configured. Add one at /v2/sessions.');
  }

  const inf = await prisma.influencer.findUnique({
    where: { platform_username: { platform, username } },
  });
  if (!inf) throw new ApiError(404, `Influencer @${username} not yet scraped.`);

  const job = await enqueueStories(username, platform);

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'pending', jobId: job.id },
    update: {},
  });

  res.status(202).json({
    jobId: job.id, platform, username, status: 'pending',
    statusUrl: `/scrape/jobs/${job.id}`,
  });
}

/** Per-profile following-list fetch. Mirrors enqueueFollowersScrape. */
async function enqueueFollowingScrape(req, res) {
  const platform = req.params.platform || DEFAULT_PLATFORM;
  const username = normalizeUsername(platform, req.params.username);

  if (platform !== 'instagram') {
    throw new ApiError(
      400,
      `Following-list fetch is only available for Instagram (requested: ${platform}).`
    );
  }
  if (!isValidUsername(platform, username)) {
    throw new ApiError(400, `Invalid Instagram username: ${req.params.username}`);
  }
  if (!env.scraper.igSessionId && !env.scraper.igCookies) {
    throw new ApiError(
      400,
      'No Instagram session configured. Set IG_COOKIES (preferred) or IG_SESSIONID in .env.'
    );
  }

  const inf = await prisma.influencer.findUnique({
    where: { platform_username: { platform, username } },
  });
  if (!inf) {
    throw new ApiError(
      404,
      `Influencer @${username} not yet scraped — run a profile scrape first.`
    );
  }

  const max =
    Math.min(
      Number(req.body?.max) || 0,
      Number(process.env.IG_FOLLOWING_MAX || process.env.IG_FOLLOWERS_MAX || 10_000)
    ) || Number(process.env.IG_FOLLOWING_MAX || process.env.IG_FOLLOWERS_MAX || 10_000);

  const job = await enqueueFollowing(username, platform, max);

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'pending', jobId: job.id },
    update: {},
  });

  res.status(202).json({
    jobId: job.id,
    platform,
    username,
    status: 'pending',
    max,
    statusUrl: `/scrape/jobs/${job.id}`,
  });
}

/** Bulk version — enqueue a following-list fetch for every IG profile. */
async function refreshAllFollowing(req, res) {
  const platform = req.body.platform || 'instagram';
  if (platform !== 'instagram') {
    throw new ApiError(
      400,
      `Following refresh is only supported for Instagram (requested: ${platform}).`
    );
  }
  if (!env.scraper.igSessionId && !env.scraper.igCookies) {
    throw new ApiError(
      400,
      'No Instagram session configured. Set IG_COOKIES (preferred) or IG_SESSIONID in .env.'
    );
  }

  const { olderThanHours = 0, onlyMissing = false, limit = 200, max } = req.body || {};

  const where = { platform: 'instagram' };
  if (olderThanHours > 0) {
    const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
    where.OR = [{ followingFetchedAt: null }, { followingFetchedAt: { lt: cutoff } }];
  }
  if (onlyMissing) {
    where.followingFetched = 0;
  }

  const rows = await prisma.influencer.findMany({
    where,
    select: { platform: true, username: true, followingFetched: true },
    orderBy: [{ followingFetchedAt: 'asc' }, { username: 'asc' }],
    take: Math.min(Math.max(Number(limit) || 200, 1), 500),
  });

  if (!rows.length) {
    return res.status(202).json({ enqueued: 0, total: 0, perProfileMax: 0 });
  }

  const perProfileMax =
    Math.min(
      Number(max) || 0,
      Number(process.env.IG_FOLLOWING_MAX || process.env.IG_FOLLOWERS_MAX || 10_000)
    ) || Number(process.env.IG_FOLLOWING_MAX || process.env.IG_FOLLOWERS_MAX || 10_000);

  const jobs = await enqueueBulkFollowing(rows, perProfileMax);

  await prisma.scrapeJob.createMany({
    data: jobs.map((job, i) => ({
      id: job.id,
      platform: rows[i].platform,
      username: rows[i].username,
      status: 'pending',
      jobId: job.id,
    })),
    skipDuplicates: true,
  });

  res.status(202).json({
    enqueued: jobs.length,
    total: rows.length,
    perProfileMax,
    note:
      'For accounts the session does not follow, IG returns ~40 per profile. ' +
      'For accounts the influencer follows, the list is more complete because ' +
      'their following list is public-by-default.',
  });
}

// Default per-click batch sizes for retries — must mirror the frontend
// constants (FOLLOWERS_BATCH=20, FOLLOWING_BATCH=400, POSTS_BATCH=10). The
// original `max` of the failed job isn't persisted on `scrape_jobs` so we
// re-apply the canonical defaults; retrying with the right batch is more
// useful than retrying with whatever ad-hoc number the previous job had.
const RETRY_FOLLOWERS_MAX = 20;
const RETRY_FOLLOWING_MAX = 400;
const RETRY_POSTS_MAX     = 10;
const RETRY_REELS_MAX     = 10;

const ALLOWED_JOB_STATUSES = new Set(['pending', 'active', 'completed', 'failed']);
const ALLOWED_JOB_KINDS    = new Set(['scrape', 'followers', 'following', 'posts', 'reels', 'stories']);

// The bullmq job id encodes the kind as a prefix:
//   scrape_<platform>_<username>_...     → 'scrape'
//   followers_<platform>_<username>_...  → 'followers'
//   following_<platform>_<username>_...  → 'following'
//   posts_<platform>_<username>_...      → 'posts'
//   reels_<platform>_<username>_...      → 'reels'
//   stories_<platform>_<username>_...    → 'stories'
const kindOf = (id) => {
  if (!id) return 'scrape';
  if (id.startsWith('followers_')) return 'followers';
  if (id.startsWith('following_')) return 'following';
  if (id.startsWith('posts_'))     return 'posts';
  if (id.startsWith('reels_'))     return 'reels';
  if (id.startsWith('stories_'))   return 'stories';
  return 'scrape';
};

/**
 * List recent scrape/follower/following jobs with optional filters. The page
 * is auth-gated by the route registration (requireAuth above).
 *
 *   GET /scrape/jobs?status=failed&kind=followers&platform=instagram&q=&limit=&offset=
 */
async function listJobs(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = {};
  if (req.query.status && ALLOWED_JOB_STATUSES.has(req.query.status)) {
    where.status = req.query.status;
  }
  if (req.query.platform && PLATFORMS.includes(req.query.platform)) {
    where.platform = req.query.platform;
  }
  if (req.query.username) {
    where.username = { contains: String(req.query.username) };
  }

  const kind = req.query.kind && ALLOWED_JOB_KINDS.has(req.query.kind) ? req.query.kind : null;
  // We don't store kind on the row, but the job id begins with the kind.
  if (kind === 'scrape')    where.id = { startsWith: 'scrape_' };
  if (kind === 'followers') where.id = { startsWith: 'followers_' };
  if (kind === 'following') where.id = { startsWith: 'following_' };

  const [items, total] = await Promise.all([
    prisma.scrapeJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.scrapeJob.count({ where }),
  ]);

  res.json({
    items: items.map((j) => ({ ...j, kind: kindOf(j.id) })),
    total,
    limit,
    offset,
  });
}

/**
 * Re-enqueue a failed (or completed-with-error) job. Re-uses the persisted
 * platform/username and infers the kind from the job id prefix; for
 * followers/following we re-apply the standard batch size since the original
 * `max` isn't stored on the row.
 *
 *   POST /scrape/jobs/:id/retry
 */
async function retryJob(req, res) {
  const { id } = req.params;
  const old = await prisma.scrapeJob.findUnique({ where: { id } });
  if (!old) throw new ApiError(404, 'Job not found');

  const platform = old.platform || DEFAULT_PLATFORM;
  const username = old.username;
  const kind = kindOf(old.id);

  let job;
  if (kind === 'followers') {
    if (platform !== 'instagram') throw new ApiError(400, 'Followers fetch is Instagram-only.');
    job = await enqueueFollowers(username, platform, RETRY_FOLLOWERS_MAX);
  } else if (kind === 'following') {
    if (platform !== 'instagram') throw new ApiError(400, 'Following fetch is Instagram-only.');
    job = await enqueueFollowing(username, platform, RETRY_FOLLOWING_MAX);
  } else if (kind === 'posts') {
    if (platform !== 'instagram') throw new ApiError(400, 'Posts fetch is Instagram-only.');
    job = await enqueuePosts(username, platform, RETRY_POSTS_MAX);
  } else if (kind === 'reels') {
    if (platform !== 'instagram') throw new ApiError(400, 'Reels fetch is Instagram-only.');
    job = await enqueueReels(username, platform, RETRY_REELS_MAX);
  } else if (kind === 'stories') {
    if (platform !== 'instagram') throw new ApiError(400, 'Stories fetch is Instagram-only.');
    job = await enqueueStories(username, platform);
  } else {
    job = await enqueueScrape(username, platform);
  }

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'pending', jobId: job.id },
    update: {},
  });

  res.status(202).json({
    jobId: job.id,
    kind,
    platform,
    username,
    status: 'pending',
    statusUrl: `/scrape/jobs/${job.id}`,
  });
}

/**
 * Bulk re-enqueue. Retries every job matching the given filter — useful when
 * IG sessions have cooled down and the user wants to clear the failure
 * backlog in one click. Caps at 200 jobs per call to avoid blowing through
 * fresh sessions in a single batch.
 *
 *   POST /scrape/jobs/retry-all
 *   body: { status?: 'failed' (default), kind?, platform?, username?, limit?: 200 }
 */
async function retryAllJobs(req, res) {
  const status = req.body?.status || 'failed';
  if (!ALLOWED_JOB_STATUSES.has(status)) {
    throw new ApiError(400, `Unknown status: ${status}`);
  }
  const limit = Math.min(Math.max(Number(req.body?.limit) || 200, 1), 200);

  const where = { status };
  if (req.body?.platform && PLATFORMS.includes(req.body.platform)) {
    where.platform = req.body.platform;
  }
  if (req.body?.username) {
    where.username = String(req.body.username);
  }
  const kind = req.body?.kind && ALLOWED_JOB_KINDS.has(req.body.kind) ? req.body.kind : null;
  if (kind === 'scrape')    where.id = { startsWith: 'scrape_' };
  if (kind === 'followers') where.id = { startsWith: 'followers_' };
  if (kind === 'following') where.id = { startsWith: 'following_' };

  const rows = await prisma.scrapeJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  if (!rows.length) {
    return res.status(202).json({ enqueued: 0, total: 0, deduped: 0 });
  }

  // De-dupe by (kind, platform, username) — multiple failed attempts at the
  // same target don't each need their own fresh job; the cursor on the
  // influencer row already encodes "where to resume."
  const seen = new Set();
  const targets = [];
  for (const row of rows) {
    const k = kindOf(row.id);
    const key = `${k}:${row.platform}:${row.username}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ kind: k, platform: row.platform || DEFAULT_PLATFORM, username: row.username });
  }

  const newJobs = [];
  for (const t of targets) {
    let job;
    if (t.kind === 'followers' && t.platform === 'instagram') {
      job = await enqueueFollowers(t.username, t.platform, RETRY_FOLLOWERS_MAX);
    } else if (t.kind === 'following' && t.platform === 'instagram') {
      job = await enqueueFollowing(t.username, t.platform, RETRY_FOLLOWING_MAX);
    } else if (t.kind === 'posts' && t.platform === 'instagram') {
      job = await enqueuePosts(t.username, t.platform, RETRY_POSTS_MAX);
    } else if (t.kind === 'reels' && t.platform === 'instagram') {
      job = await enqueueReels(t.username, t.platform, RETRY_REELS_MAX);
    } else if (t.kind === 'stories' && t.platform === 'instagram') {
      job = await enqueueStories(t.username, t.platform);
    } else {
      job = await enqueueScrape(t.username, t.platform);
    }
    await prisma.scrapeJob.upsert({
      where: { id: job.id },
      create: { id: job.id, platform: t.platform, username: t.username, status: 'pending', jobId: job.id },
      update: {},
    });
    newJobs.push({ jobId: job.id, kind: t.kind, platform: t.platform, username: t.username });
  }

  res.status(202).json({
    enqueued: newJobs.length,
    total: rows.length,
    deduped: rows.length - newJobs.length,
    jobs: newJobs,
  });
}

module.exports = {
  enqueue,
  jobStatus,
  listJobs,
  retryJob,
  retryAllJobs,
  bulkEnqueue,
  refreshAll,
  enqueueFollowersScrape,
  refreshAllFollowers,
  enqueueFollowingScrape,
  refreshAllFollowing,
  enqueuePostsScrape,
  enqueueReelsScrape,
  enqueueStoriesScrape,
};
