'use strict';

const { Queue, QueueEvents } = require('bullmq');
const { buildConnection } = require('../config/redis');
const logger = require('../utils/logger');
const { DEFAULT_PLATFORM } = require('../scraper/registry');

const QUEUE_NAME = 'scrape-influencer';

const connection = buildConnection();

const scrapeQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

const queueEvents = new QueueEvents(QUEUE_NAME, { connection: buildConnection() });
queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error({ jobId, reason: failedReason }, 'scrape job failed');
});
queueEvents.on('completed', ({ jobId }) => {
  logger.info({ jobId }, 'scrape job completed');
});

// BullMQ 5.x rejects ':' in custom job IDs because it uses ':' as its Redis
// key separator. Use '_' instead so the ID stays human-readable in logs.
const jobIdFor = (platform, username, suffix) =>
  `scrape_${platform}_${username}_${suffix}`;

async function enqueueScrape(username, platform = DEFAULT_PLATFORM) {
  const jobId = jobIdFor(
    platform,
    username,
    `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  return scrapeQueue.add('scrape', { platform, username }, { jobId, priority: 1 });
}

async function enqueueBulkScrapes(items) {
  if (!items.length) return [];
  const ts = Date.now();
  return scrapeQueue.addBulk(
    items.map((it, i) => {
      const platform = it.platform || DEFAULT_PLATFORM;
      const username = it.username;
      return {
        name: 'scrape',
        data: { platform, username },
        opts: {
          jobId: jobIdFor(platform, username, `${ts}_${i}`),
          priority: 5,
        },
      };
    })
  );
}

/**
 * Enqueue a follower-list fetch. Lower priority than profile scrapes — these
 * are long-running (minutes) and should never block fast user-triggered
 * profile scrapes.
 */
async function enqueueFollowers(username, platform = DEFAULT_PLATFORM, max) {
  const jobId = `followers_${platform}_${username}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return scrapeQueue.add(
    'followers',
    { platform, username, max },
    {
      jobId,
      priority: 10,
      // followers jobs shouldn't auto-retry — Instagram bans the session,
      // so retrying just burns it faster. User can manually re-fetch.
      attempts: 1,
    }
  );
}

/**
 * Bulk version: one Redis pipeline for N follower fetches. Used by the
 * "Fetch followers for everyone" admin action.
 */
async function enqueueBulkFollowers(items, max) {
  if (!items.length) return [];
  const ts = Date.now();
  return scrapeQueue.addBulk(
    items.map((it, i) => {
      const platform = it.platform || DEFAULT_PLATFORM;
      const username = it.username;
      const rand = Math.random().toString(36).slice(2, 6);
      return {
        name: 'followers',
        data: { platform, username, max },
        opts: {
          jobId: `followers_${platform}_${username}_${ts}_${i}_${rand}`,
          priority: 12,
          attempts: 1,
        },
      };
    })
  );
}

/** Single-profile following-list fetch. Same shape as enqueueFollowers. */
async function enqueueFollowing(username, platform = DEFAULT_PLATFORM, max) {
  const jobId = `following_${platform}_${username}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return scrapeQueue.add(
    'following',
    { platform, username, max },
    { jobId, priority: 10, attempts: 1 }
  );
}

/**
 * Paginated posts fetch — walks IG feed/user using the saved next_max_id
 * cursor on the influencer row. Each click fetches `max` more posts.
 */
async function enqueuePosts(username, platform = DEFAULT_PLATFORM, max) {
  const jobId = `posts_${platform}_${username}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return scrapeQueue.add(
    'posts',
    { platform, username, max },
    { jobId, priority: 8, attempts: 1 }
  );
}

/** Paginated reels fetch — IG's clips/user endpoint, cursor on Influencer. */
async function enqueueReels(username, platform = DEFAULT_PLATFORM, max) {
  const jobId = `reels_${platform}_${username}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return scrapeQueue.add(
    'reels',
    { platform, username, max },
    { jobId, priority: 8, attempts: 1 }
  );
}

/** One-shot stories snapshot — no cursor (24h window, full set per call). */
async function enqueueStories(username, platform = DEFAULT_PLATFORM) {
  const jobId = `stories_${platform}_${username}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return scrapeQueue.add(
    'stories',
    { platform, username },
    { jobId, priority: 7, attempts: 1 }
  );
}

/** Bulk version of the following fetch. */
async function enqueueBulkFollowing(items, max) {
  if (!items.length) return [];
  const ts = Date.now();
  return scrapeQueue.addBulk(
    items.map((it, i) => {
      const platform = it.platform || DEFAULT_PLATFORM;
      const username = it.username;
      const rand = Math.random().toString(36).slice(2, 6);
      return {
        name: 'following',
        data: { platform, username, max },
        opts: {
          jobId: `following_${platform}_${username}_${ts}_${i}_${rand}`,
          priority: 12,
          attempts: 1,
        },
      };
    })
  );
}

module.exports = {
  scrapeQueue,
  queueEvents,
  enqueueScrape,
  enqueueBulkScrapes,
  enqueueFollowers,
  enqueueBulkFollowers,
  enqueueFollowing,
  enqueueBulkFollowing,
  enqueuePosts,
  enqueueReels,
  enqueueStories,
  QUEUE_NAME,
};
