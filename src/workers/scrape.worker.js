'use strict';

const http = require('http');
const { Worker } = require('bullmq');
const { buildConnection } = require('../config/redis');
const env = require('../config/env');
const logger = require('../utils/logger');

// Hugging Face Spaces (and most container PaaS) flip a service to "running"
// only once it binds $PORT. The worker is a queue consumer with no HTTP
// surface of its own, so we expose a tiny status endpoint to satisfy the
// health gate and give a public liveness URL.
const healthPort = Number(process.env.PORT) || 7860;
http
  .createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', role: 'worker', uptime: process.uptime() }));
  })
  .listen(healthPort, () => logger.info({ port: healthPort }, 'worker health server listening'));
const prisma = require('../prisma/client');
const { getScraper, DEFAULT_PLATFORM } = require('../scraper/registry');
const { persistScrapeResult, recomputeAggregateMetrics } = require('../services/influencer.service');
const { QUEUE_NAME } = require('../queue/scrape.queue');
const igFollowers = require('../scraper/instagram.followers');
const igFollowing = require('../scraper/instagram.following');
const igPosts = require('../scraper/instagram.posts');
const igReels = require('../scraper/instagram.reels');
const igStories = require('../scraper/instagram.stories');
const ytPosts = require('../scraper/youtube.posts');
const graph = require('../services/graph.service');
const cache = require('../services/cache.service');

// The /influencer/:platform/:username endpoint memoizes its response in
// Redis (TTL = CACHE_TTL_SECONDS, default 5 min). Every job that touches
// the influencer row (profile scrape, followers/following/posts fetch)
// must bust this key, otherwise the frontend keeps polling stale data.
const bustInfluencerCache = (platform, username) =>
  cache.del(`influencer:${platform}:${username}`).catch(() => {});

logger.info({ concurrency: env.worker.concurrency }, 'starting scrape worker');

// === Profile scrape handler ==============================================
async function handleScrape(job) {
  const platform = job.data.platform || DEFAULT_PLATFORM;
  const username = job.data.username;
  logger.info(
    { jobId: job.id, platform, username, attempt: job.attemptsMade + 1 },
    'processing scrape'
  );

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: {
      id: job.id, platform, username,
      status: 'active', attempts: job.attemptsMade + 1, jobId: job.id,
    },
    update: { status: 'active', attempts: job.attemptsMade + 1, platform },
  });

  try {
    const scraper = getScraper(platform);
    const data = await scraper.scrape(username);
    if (typeof scraper.normalizePosts === 'function') {
      data.posts = scraper.normalizePosts(data.posts);
    }
    const influencer = await persistScrapeResult({ ...data, platform });

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'completed', completedAt: new Date(), error: null },
    });

    await bustInfluencerCache(platform, username);
    logger.info(
      { platform, username, influencerId: influencer.id, followers: influencer.followers },
      'scrape persisted'
    );
    return { influencerId: influencer.id, followers: influencer.followers };
  } catch (err) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: (err.message || 'unknown').slice(0, 500) },
    });
    throw err;
  }
}

// === Followers fetch handler =============================================
async function handleFollowers(job) {
  const platform = job.data.platform || DEFAULT_PLATFORM;
  const username = job.data.username;
  const max = job.data.max || igFollowers.DEFAULT_MAX;

  logger.info({ jobId: job.id, platform, username, max }, 'processing followers fetch');

  if (platform !== 'instagram') {
    throw new Error(
      `Followers fetch is only supported for Instagram (requested: ${platform})`
    );
  }

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: {
      id: job.id, platform, username,
      status: 'active', attempts: 1, jobId: job.id,
    },
    update: { status: 'active' },
  });

  try {
    // Resolve user_id (and refresh profile snapshot) first.
    const { userId } = await igFollowers.resolvePlatformUserId(username);

    const inf = await prisma.influencer.findUnique({
      where: { platform_username: { platform, username } },
    });
    if (!inf) {
      throw new Error(`Influencer ${platform}/${username} not yet scraped — run profile scrape first.`);
    }

    if (inf.platformUserId !== userId) {
      await prisma.influencer.update({
        where: { id: inf.id },
        data: { platformUserId: userId },
      });
    }

    // Run the paginated scrape, persisting after every page. Resume from the
    // saved cursor so each "fetch N more" click advances IG's pagination
    // instead of restarting from page 1.
    const result = await igFollowers.scrapeFollowers({
      influencerId: inf.id,
      username,
      userId,
      max,
      startCursor: inf.followersCursor || null,
      onProgress: async ({ pages }) => {
        // Use the actual row count rather than the per-job tally so the UI
        // reflects cumulative progress across multiple "fetch more" clicks.
        const totalRows = await prisma.follower.count({ where: { influencerId: inf.id } });
        try { await job.updateProgress(totalRows); } catch {}
        await prisma.influencer.update({
          where: { id: inf.id },
          data: { followersFetched: totalRows, followersFetchedAt: new Date() },
        });
        if (pages % 5 === 0) {
          logger.info({ username, pages, totalRows }, 'followers progress');
        }
      },
    });

    const totalRows = await prisma.follower.count({ where: { influencerId: inf.id } });
    await prisma.influencer.update({
      where: { id: inf.id },
      data: {
        followersFetched: totalRows,
        followersFetchedAt: new Date(),
        followersBlocked: result.blocked,
        // Persist the next cursor even when blocked, so the next click can
        // resume from the page IG cut us off on (after sessions cool down).
        followersCursor: result.nextCursor || null,
      },
    });

    // A blocked fetch is a failure to the user — they expected N more
    // followers and IG cut us off. Mark `failed` so the Jobs page surfaces
    // it under the "Failed" filter and exposes a Retry button.
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: result.blocked ? 'failed' : 'completed',
        completedAt: new Date(),
        error: result.blocked ? `Stopped early: ${result.blockedReason}` : null,
      },
    });

    await bustInfluencerCache(platform, username);
    logger.info(
      { username, fetched: result.fetched, pages: result.pages, blocked: result.blocked },
      'followers fetch done'
    );
    return result;
  } catch (err) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: (err.message || 'unknown').slice(0, 500) },
    });
    throw err;
  }
}

// === Following fetch handler =============================================
// Mirrors handleFollowers but persists into `following` table and updates
// the followingFetched / followingBlocked fields on Influencer.
async function handleFollowing(job) {
  const platform = job.data.platform || DEFAULT_PLATFORM;
  const username = job.data.username;
  const max = job.data.max || igFollowing.DEFAULT_MAX;

  logger.info({ jobId: job.id, platform, username, max }, 'processing following fetch');

  if (platform !== 'instagram') {
    throw new Error(
      `Following fetch is only supported for Instagram (requested: ${platform})`
    );
  }

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: {
      id: job.id, platform, username,
      status: 'active', attempts: 1, jobId: job.id,
    },
    update: { status: 'active' },
  });

  try {
    // Reuse the resolver in instagram.followers — it's a generic user_id lookup.
    const { userId } = await igFollowers.resolvePlatformUserId(username);

    const inf = await prisma.influencer.findUnique({
      where: { platform_username: { platform, username } },
    });
    if (!inf) {
      throw new Error(`Influencer ${platform}/${username} not yet scraped — run profile scrape first.`);
    }

    if (inf.platformUserId !== userId) {
      await prisma.influencer.update({
        where: { id: inf.id },
        data: { platformUserId: userId },
      });
    }

    const result = await igFollowing.scrapeFollowing({
      influencerId: inf.id,
      username,
      userId,
      max,
      startCursor: inf.followingCursor || null,
      onProgress: async ({ pages }) => {
        const totalRows = await prisma.following.count({ where: { influencerId: inf.id } });
        try { await job.updateProgress(totalRows); } catch {}
        await prisma.influencer.update({
          where: { id: inf.id },
          data: { followingFetched: totalRows, followingFetchedAt: new Date() },
        });
        if (pages % 5 === 0) {
          logger.info({ username, pages, totalRows }, 'following progress');
        }
      },
    });

    const totalRows = await prisma.following.count({ where: { influencerId: inf.id } });
    await prisma.influencer.update({
      where: { id: inf.id },
      data: {
        followingFetched: totalRows,
        followingFetchedAt: new Date(),
        followingBlocked: result.blocked,
        followingCursor: result.nextCursor || null,
      },
    });

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: result.blocked ? 'failed' : 'completed',
        completedAt: new Date(),
        error: result.blocked ? `Stopped early: ${result.blockedReason}` : null,
      },
    });

    await bustInfluencerCache(platform, username);
    logger.info(
      { username, fetched: result.fetched, pages: result.pages, blocked: result.blocked },
      'following fetch done'
    );
    return result;
  } catch (err) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: (err.message || 'unknown').slice(0, 500) },
    });
    throw err;
  }
}

// === Posts fetch handler =================================================
// Paginates content for a single influencer using the saved `postsCursor`.
// Dispatches to the right scraper by platform — IG goes through the
// PolarisProfilePostsTab GraphQL endpoint; YT walks the InnerTube
// `/youtubei/v1/browse` continuation chain.
async function handlePosts(job) {
  const platform = job.data.platform || DEFAULT_PLATFORM;
  const username = job.data.username;
  const max = job.data.max || 10;

  logger.info({ jobId: job.id, platform, username, max }, 'processing posts fetch');

  if (!['instagram', 'youtube'].includes(platform)) {
    throw new Error(`Posts fetch not supported for ${platform} (instagram, youtube only)`);
  }

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'active', attempts: 1, jobId: job.id },
    update: { status: 'active' },
  });

  try {
    const inf = await prisma.influencer.findUnique({
      where: { platform_username: { platform, username } },
    });
    if (!inf) {
      throw new Error(`Influencer ${platform}/${username} not yet scraped — run profile scrape first.`);
    }

    const scrapeArgs = {
      influencerId: inf.id,
      username,
      max,
      startCursor: inf.postsCursor || null,
      onProgress: async ({ pages, fetched }) => {
        try { await job.updateProgress(fetched); } catch {}
        if (pages % 3 === 0) {
          logger.info({ platform, username, pages, fetched }, 'posts progress');
        }
      },
    };

    const result = platform === 'youtube'
      ? await ytPosts.scrapeVideos(scrapeArgs)
      : await igPosts.scrapePosts(scrapeArgs);

    await prisma.influencer.update({
      where: { id: inf.id },
      data: {
        postsCursor: result.nextCursor || null,
        postsFetchedAt: new Date(),
      },
    });

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: result.blocked ? 'failed' : 'completed',
        completedAt: new Date(),
        error: result.blocked ? `Stopped early: ${result.blockedReason}` : null,
      },
    });

    // Recompute the influencer-level aggregates (engagementRate, avgLikes,
    // avgComments, avgViews, postingFrequency) from the latest 30 stored
    // posts so the detail hero reflects what we just fetched.
    await recomputeAggregateMetrics(inf.id).catch((err) =>
      logger.warn({ err: err.message, username }, 'recompute metrics failed')
    );
    await bustInfluencerCache(platform, username);
    logger.info(
      { username, fetched: result.fetched, pages: result.pages, blocked: result.blocked },
      'posts fetch done'
    );
    return result;
  } catch (err) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: (err.message || 'unknown').slice(0, 500) },
    });
    throw err;
  }
}

// === Reels fetch handler =================================================
// Cursor-paginated walk of IG's clips/user endpoint. Reels are upserted into
// the `posts` table with mediaType='reel' so they show up alongside regular
// posts in the engagement-rate sample.
async function handleReels(job) {
  const platform = job.data.platform || DEFAULT_PLATFORM;
  const username = job.data.username;
  const max = job.data.max || 10;

  logger.info({ jobId: job.id, platform, username, max }, 'processing reels fetch');
  if (platform !== 'instagram') throw new Error('Reels fetch is Instagram-only.');

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'active', attempts: 1, jobId: job.id },
    update: { status: 'active' },
  });

  try {
    const { userId } = await igFollowers.resolvePlatformUserId(username);
    const inf = await prisma.influencer.findUnique({
      where: { platform_username: { platform, username } },
    });
    if (!inf) throw new Error(`Influencer ${platform}/${username} not yet scraped.`);

    if (inf.platformUserId !== userId) {
      await prisma.influencer.update({ where: { id: inf.id }, data: { platformUserId: userId } });
    }

    const result = await igReels.scrapeReels({
      influencerId: inf.id, username, userId, max,
      startCursor: inf.reelsCursor || null,
      onProgress: async ({ pages, fetched }) => {
        try { await job.updateProgress(fetched); } catch {}
        if (pages % 3 === 0) logger.info({ username, pages, fetched }, 'reels progress');
      },
    });

    await prisma.influencer.update({
      where: { id: inf.id },
      data: { reelsCursor: result.nextCursor || null, reelsFetchedAt: new Date() },
    });

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: result.blocked ? 'failed' : 'completed',
        completedAt: new Date(),
        error: result.blocked ? `Stopped early: ${result.blockedReason}` : null,
      },
    });

    await recomputeAggregateMetrics(inf.id).catch(() => {});
    await bustInfluencerCache(platform, username);
    logger.info({ username, fetched: result.fetched, pages: result.pages, blocked: result.blocked }, 'reels fetch done');
    return result;
  } catch (err) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: (err.message || 'unknown').slice(0, 500) },
    });
    throw err;
  }
}

// === Stories fetch handler ===============================================
// One-shot snapshot — IG returns the entire current 24h-active set in a
// single call. No cursor needed.
async function handleStories(job) {
  const platform = job.data.platform || DEFAULT_PLATFORM;
  const username = job.data.username;

  logger.info({ jobId: job.id, platform, username }, 'processing stories fetch');
  if (platform !== 'instagram') throw new Error('Stories fetch is Instagram-only.');

  await prisma.scrapeJob.upsert({
    where: { id: job.id },
    create: { id: job.id, platform, username, status: 'active', attempts: 1, jobId: job.id },
    update: { status: 'active' },
  });

  try {
    const { userId } = await igFollowers.resolvePlatformUserId(username);
    const inf = await prisma.influencer.findUnique({
      where: { platform_username: { platform, username } },
    });
    if (!inf) throw new Error(`Influencer ${platform}/${username} not yet scraped.`);

    const result = await igStories.scrapeStories({
      influencerId: inf.id, username, userId,
    });

    await prisma.influencer.update({
      where: { id: inf.id },
      data: { storiesFetchedAt: new Date() },
    });

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: result.blocked ? 'failed' : 'completed',
        completedAt: new Date(),
        error: result.blocked ? `Stopped early: ${result.blockedReason}` : null,
      },
    });

    await bustInfluencerCache(platform, username);
    logger.info({ username, fetched: result.fetched, blocked: result.blocked }, 'stories fetch done');
    return result;
  } catch (err) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: (err.message || 'unknown').slice(0, 500) },
    });
    throw err;
  }
}

// === Single Worker, dispatches by job name ==============================
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case 'scrape':    return handleScrape(job);
      case 'followers': return handleFollowers(job);
      case 'following': return handleFollowing(job);
      case 'posts':     return handlePosts(job);
      case 'reels':     return handleReels(job);
      case 'stories':   return handleStories(job);
      default: throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection: buildConnection(),
    concurrency: env.worker.concurrency,
  }
);

worker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      jobName: job?.name,
      platform: job?.data?.platform,
      username: job?.data?.username,
      err: err.message,
    },
    'worker job failed'
  );
});

worker.on('completed', (job) => {
  logger.info(
    {
      jobId: job.id,
      jobName: job.name,
      platform: job.data?.platform,
      username: job.data?.username,
    },
    'worker job done'
  );
});

const shutdown = async (signal) => {
  logger.info({ signal }, 'worker shutting down');
  try {
    await worker.close();
    await prisma.$disconnect();
    await graph.shutdown();
    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message }, 'shutdown error');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled rejection in worker');
});
