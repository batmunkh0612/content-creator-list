'use strict';

const prisma = require('../prisma/client');
const { enrichWithTracked, countTrackedOverlap } = require('./follower.service');

async function listFollowing({ platform, username, limit = 50, offset = 0, q }) {
  const inf = await prisma.influencer.findUnique({
    where: { platform_username: { platform, username } },
    select: {
      id: true,
      platform: true,
      username: true,
      following: true,            // the count from the profile scrape
      followingFetched: true,
      followingFetchedAt: true,
      followingBlocked: true,
    },
  });
  if (!inf) return null;

  const where = { influencerId: inf.id };
  if (q && q.trim()) {
    where.OR = [
      { username: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total, totalTracked] = await Promise.all([
    prisma.following.findMany({
      where,
      orderBy: { fetchedAt: 'asc' },
      skip: offset,
      take: limit,
      select: {
        username: true,
        fullName: true,
        profilePicUrl: true,
        isVerified: true,
        isPrivate: true,
        fetchedAt: true,
      },
    }),
    prisma.following.count({ where }),
    countTrackedOverlap('following', inf.id),
  ]);

  // Enrich with cached counts from any matching tracked Influencer rows.
  const enriched = await enrichWithTracked(items);

  return {
    influencer: {
      platform: inf.platform,
      username: inf.username,
      following: inf.following,
      followingFetched: inf.followingFetched,
      followingFetchedAt: inf.followingFetchedAt,
      followingBlocked: inf.followingBlocked,
      trackedOverlap: totalTracked,
    },
    items: enriched,
    total,
    limit,
    offset,
  };
}

module.exports = { listFollowing };
