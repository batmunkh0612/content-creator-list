'use strict';

const influencerService = require('../services/influencer.service');
const followerService = require('../services/follower.service');
const followingService = require('../services/following.service');
const cache = require('../services/cache.service');
const ApiError = require('../utils/ApiError');
const {
  PLATFORMS,
  DEFAULT_PLATFORM,
  normalizeUsername,
} = require('../scraper/registry');

async function getOne(req, res) {
  const platform = req.params.platform || req.query.platform || DEFAULT_PLATFORM;
  if (!PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unknown platform: ${platform}`);
  }
  const username = normalizeUsername(platform, req.params.username);

  const data = await cache.wrap(`influencer:${platform}:${username}`, () =>
    influencerService.getByUsername(platform, username)
  );

  if (!data) {
    throw new ApiError(
      404,
      `No data for ${platform}/@${username} — POST /scrape/${platform}/${username} to fetch.`
    );
  }
  res.json(data);
}

async function list(req, res) {
  const result = await influencerService.listInfluencers(req.query);
  res.json(result);
}

async function getFollowers(req, res) {
  const platform = req.params.platform || req.query.platform || DEFAULT_PLATFORM;
  if (!PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unknown platform: ${platform}`);
  }
  const username = normalizeUsername(platform, req.params.username);

  const limit  = Math.min(Math.max(Number(req.query.limit)  || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const q = req.query.q ? String(req.query.q) : undefined;

  const data = await followerService.listFollowers({
    platform, username, limit, offset, q,
  });

  if (!data) {
    throw new ApiError(
      404,
      `Influencer ${platform}/@${username} not tracked yet — run a profile scrape first.`
    );
  }
  res.json(data);
}

async function getFollowing(req, res) {
  const platform = req.params.platform || req.query.platform || DEFAULT_PLATFORM;
  if (!PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unknown platform: ${platform}`);
  }
  const username = normalizeUsername(platform, req.params.username);

  const limit  = Math.min(Math.max(Number(req.query.limit)  || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const q = req.query.q ? String(req.query.q) : undefined;

  const data = await followingService.listFollowing({
    platform, username, limit, offset, q,
  });

  if (!data) {
    throw new ApiError(
      404,
      `Influencer ${platform}/@${username} not tracked yet — run a profile scrape first.`
    );
  }
  res.json(data);
}

/**
 * Re-run the aggregate metric formulas (engagementRate, avgLikes,
 * avgComments, avgViews, postingFrequency) using whatever posts are
 * currently in the DB for this influencer. Useful after a manual data
 * correction, or any time cached metrics drift from the live posts list.
 */
async function recomputeMetrics(req, res) {
  const platform = req.params.platform || req.query.platform || DEFAULT_PLATFORM;
  if (!PLATFORMS.includes(platform)) {
    throw new ApiError(400, `Unknown platform: ${platform}`);
  }
  const username = normalizeUsername(platform, req.params.username);

  const inf = await influencerService.getByUsername(platform, username);
  if (!inf) {
    throw new ApiError(404, `Influencer ${platform}/@${username} not tracked yet.`);
  }
  const sampleSize = Math.min(Math.max(Number(req.body?.sampleSize) || 30, 5), 200);
  const updated = await influencerService.recomputeAggregateMetrics(inf.id, sampleSize);

  // Bust the GET cache so the next /influencer/... fetch returns the fresh
  // numbers rather than the stale 5-minute-cached response.
  await cache.del(`influencer:${platform}:${username}`);

  res.json({
    platform, username,
    sampleSize,
    engagementRate: updated.engagementRate,
    avgLikes: updated.avgLikes,
    avgComments: updated.avgComments,
    avgViews: updated.avgViews,
    postingFrequency: updated.postingFrequency,
  });
}

module.exports = { getOne, list, getFollowers, getFollowing, recomputeMetrics };
