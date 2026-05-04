'use strict';

const prisma = require('../prisma/client');
const {
  calculateEngagementRate,
  calculatePostingFrequency,
  calculateAverages,
} = require('../utils/metrics');
const { DEFAULT_PLATFORM } = require('../scraper/registry');
const graph = require('./graph.service');

/**
 * Persist a scrape result. Upserts the (platform, username) row, replaces
 * its 12 latest posts, and recomputes derived metrics in a single
 * transaction so readers never see a partial update.
 */
async function persistScrapeResult(data) {
  const platform = data.platform || DEFAULT_PLATFORM;
  const posts = data.posts || [];

  const engagementRate = calculateEngagementRate({ posts, followers: data.followers });
  const postingFrequency = calculatePostingFrequency(posts);
  const { avgLikes, avgComments } = calculateAverages(posts);

  // Average view count is meaningful for video-first platforms.
  const viewBearing = posts.filter((p) => typeof p.views === 'number');
  const avgViews =
    viewBearing.length > 0
      ? viewBearing.reduce((s, p) => s + (p.views || 0), 0) / viewBearing.length
      : 0;

  return prisma.$transaction(async (tx) => {
    const baseFields = {
      platform,
      username: data.username,
      fullName: data.fullName,
      bio: data.bio,
      profilePicUrl: data.profilePicUrl,
      externalUrl: data.externalUrl,
      isVerified: Boolean(data.isVerified),
      followers: data.followers || 0,
      following: data.following || 0,
      postsCount: data.postsCount || 0,
      engagementRate,
      postingFrequency,
      avgLikes,
      avgComments,
      avgViews,
      totalLikes:
        data.totalLikes !== undefined && data.totalLikes !== null
          ? BigInt(data.totalLikes)
          : null,
      lastScrapedAt: new Date(),
    };

    const influencer = await tx.influencer.upsert({
      where: { platform_username: { platform, username: data.username } },
      create: baseFields,
      update: baseFields,
    });

    // Upsert posts by shortcode so re-scrapes refresh likes/comments without
    // wiping older posts the user has accumulated via "fetch more posts".
    // Posts without a shortcode are skipped — they'd collide on subsequent
    // scrapes since shortcode is the unique key.
    for (const p of posts) {
      if (!p.shortcode) continue;
      await tx.post.upsert({
        where: { shortcode: p.shortcode },
        create: {
          influencerId: influencer.id,
          shortcode: p.shortcode,
          likes: p.likes || 0,
          comments: p.comments || 0,
          views: p.views ?? null,
          shares: p.shares ?? null,
          caption: p.caption,
          mediaType: p.mediaType,
          mediaUrl: p.mediaUrl,
          permalink: p.permalink,
          postedAt: p.postedAt,
        },
        update: {
          likes: p.likes || 0,
          comments: p.comments || 0,
          views: p.views ?? null,
          shares: p.shares ?? null,
          caption: p.caption,
          mediaType: p.mediaType,
          mediaUrl: p.mediaUrl,
          permalink: p.permalink,
        },
      });
    }

    return influencer;
  }).then((influencer) => {
    // Mirror to Neo4j (best-effort, fire-and-forget). The graph service
    // swallows its own errors so a Neo4j outage never breaks scraping.
    graph.mirrorInfluencer(influencer).catch(() => {});
    return influencer;
  });
}

// JSON-serialize BigInts as strings since JSON has no native support.
function serialize(row) {
  if (!row) return row;
  return {
    ...row,
    totalLikes: row.totalLikes !== null && row.totalLikes !== undefined
      ? row.totalLikes.toString()
      : null,
  };
}

async function getByUsername(platform, username) {
  // Bump the post limit to 200 so the frontend's "load 10 more" can walk
  // the full set the user has accumulated via posts-fetch-more without
  // another round-trip. 200 caps memory/transfer on extreme accounts.
  const row = await prisma.influencer.findUnique({
    where: { platform_username: { platform, username } },
    include: {
      posts:   { orderBy: { postedAt: 'desc' }, take: 200 },
      // Stories: latest 50 (covers ~2 days of an active poster). The UI
      // splits them into "live now" (expiresAt > now) and "history".
      stories: { orderBy: { takenAt: 'desc' }, take: 50 },
    },
  });
  return serialize(row);
}

async function listInfluencers(filters) {
  const {
    platform,
    minFollowers,
    maxFollowers,
    engagementRate,
    limit,
    offset,
    sortBy,
    sortDir,
  } = filters;

  const where = {};
  if (platform) where.platform = platform;
  if (minFollowers !== undefined || maxFollowers !== undefined) {
    where.followers = {};
    if (minFollowers !== undefined) where.followers.gte = minFollowers;
    if (maxFollowers !== undefined) where.followers.lte = maxFollowers;
  }
  if (engagementRate !== undefined) {
    where.engagementRate = { gte: engagementRate };
  }

  const [items, total] = await Promise.all([
    prisma.influencer.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: offset,
      take: limit,
    }),
    prisma.influencer.count({ where }),
  ]);

  return { items: items.map(serialize), total, limit, offset };
}

/**
 * Recompute the cached aggregate metrics on an Influencer row from the
 * latest N stored posts. Call this whenever new posts are added (e.g., the
 * posts-fetch-more worker) so engagementRate / avgLikes / avgComments /
 * avgViews / postingFrequency stay in sync with what the user just pulled.
 *
 * Sample size of 30 matches what other influencer tools use for "recent
 * engagement" — small enough to track current performance, big enough to
 * smooth out a single viral outlier.
 */
async function recomputeAggregateMetrics(influencerId, sampleSize = 30) {
  const inf = await prisma.influencer.findUnique({
    where: { id: influencerId },
    select: { id: true, followers: true },
  });
  if (!inf) return null;

  const posts = await prisma.post.findMany({
    where: { influencerId: inf.id },
    orderBy: { postedAt: 'desc' },
    take: sampleSize,
    select: { likes: true, comments: true, views: true, postedAt: true },
  });

  const engagementRate = calculateEngagementRate({ posts, followers: inf.followers });
  const postingFrequency = calculatePostingFrequency(posts);
  const { avgLikes, avgComments } = calculateAverages(posts);

  const viewBearing = posts.filter((p) => typeof p.views === 'number');
  const avgViews = viewBearing.length > 0
    ? viewBearing.reduce((s, p) => s + (p.views || 0), 0) / viewBearing.length
    : 0;

  return prisma.influencer.update({
    where: { id: inf.id },
    data: { engagementRate, postingFrequency, avgLikes, avgComments, avgViews },
  });
}

module.exports = { persistScrapeResult, getByUsername, listInfluencers, recomputeAggregateMetrics };
