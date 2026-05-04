'use strict';

const prisma = require('../prisma/client');

/**
 * List followers for an influencer, paginated. For each row, cheaply look
 * up whether that handle is ALSO a tracked Influencer in the workspace —
 * if yes, surface its cached counts (followers / following / posts /
 * engagement) so the UI can render real numbers per row without an extra
 * IG roundtrip per follower (which would burn the session very fast).
 */
async function listFollowers({ platform, username, limit = 50, offset = 0, q }) {
  const inf = await prisma.influencer.findUnique({
    where: { platform_username: { platform, username } },
    select: {
      id: true,
      platform: true,
      username: true,
      followers: true,
      followersFetched: true,
      followersFetchedAt: true,
      followersBlocked: true,
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
    prisma.follower.findMany({
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
    prisma.follower.count({ where }),
    // How many of this influencer's followers are also tracked influencers
    // — useful as a header stat ("12 of 100 tracked").
    countTrackedOverlap('follower', inf.id),
  ]);

  const enriched = await enrichWithTracked(items);

  return {
    influencer: {
      platform: inf.platform,
      username: inf.username,
      followers: inf.followers,
      followersFetched: inf.followersFetched,
      followersFetchedAt: inf.followersFetchedAt,
      followersBlocked: inf.followersBlocked,
      trackedOverlap: totalTracked,
    },
    items: enriched,
    total,
    limit,
    offset,
  };
}

/**
 * Cross-reference each row with the Influencer table by username, in a
 * single query. Adds: tracked (bool), followers, following, postsCount,
 * engagementRate, isVerified (overrides if tracked has fresher data).
 *
 * Exported so the following service can reuse the same shape.
 */
async function enrichWithTracked(items) {
  if (!items.length) return items;
  const usernames = items.map((i) => i.username);
  const tracked = await prisma.influencer.findMany({
    where: { platform: 'instagram', username: { in: usernames } },
    select: {
      username: true,
      followers: true,
      following: true,
      postsCount: true,
      engagementRate: true,
      isVerified: true,
      lastScrapedAt: true,
    },
  });
  const map = Object.fromEntries(tracked.map((t) => [t.username, t]));

  return items.map((it) => {
    const t = map[it.username];
    if (!t) return { ...it, tracked: false };
    return {
      ...it,
      tracked: true,
      followersCount: t.followers,
      followingCount: t.following,
      postsCount: t.postsCount,
      engagementRate: t.engagementRate,
      // If we have a tracked record, prefer its verified flag (the friendship
      // endpoint sometimes lags behind reality).
      isVerified: it.isVerified || t.isVerified,
      trackedScrapedAt: t.lastScrapedAt,
    };
  });
}

// Cheap aggregate: how many distinct usernames in `kind` (follower or
// following) match an Influencer record? Used for the "X tracked of Y" stat.
async function countTrackedOverlap(kind, influencerId) {
  const table = kind === 'follower' ? 'followers' : 'following';
  // Raw count via SQL — cheaper than two queries + an in-memory intersect.
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n
       FROM "${table}" f
       JOIN influencers i ON i.username = f.username AND i.platform = 'instagram'
      WHERE f."influencerId" = $1`,
    influencerId
  );
  return rows[0]?.n ?? 0;
}

module.exports = { listFollowers, enrichWithTracked, countTrackedOverlap };
