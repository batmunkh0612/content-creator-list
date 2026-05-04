'use strict';

const prisma = require('../prisma/client');
const cache = require('../services/cache.service');

async function summary(_req, res) {
  // 60s TTL — dashboard tolerates slightly stale numbers more than DB load.
  const data = await cache.wrap(
    'dashboard:summary',
    async () => {
      const [
        totalInfluencers,
        totalPosts,
        pendingJobs,
        failedJobs,
        completedJobs,
        platformBreakdown,
        topByFollowers,
        topByEngagement,
        recentlyScraped,
      ] = await Promise.all([
        prisma.influencer.count(),
        prisma.post.count(),
        prisma.scrapeJob.count({ where: { status: 'pending' } }),
        prisma.scrapeJob.count({ where: { status: 'failed' } }),
        prisma.scrapeJob.count({ where: { status: 'completed' } }),
        prisma.influencer.groupBy({
          by: ['platform'],
          _count: { _all: true },
          _sum: { followers: true },
        }),
        prisma.influencer.findMany({
          orderBy: { followers: 'desc' },
          take: 10,
          select: {
            username: true,
            platform: true,
            followers: true,
            engagementRate: true,
            isVerified: true,
            profilePicUrl: true,
          },
        }),
        prisma.influencer.findMany({
          where: { followers: { gt: 0 } },
          orderBy: { engagementRate: 'desc' },
          take: 10,
          select: {
            username: true,
            platform: true,
            followers: true,
            engagementRate: true,
            isVerified: true,
            profilePicUrl: true,
          },
        }),
        prisma.influencer.findMany({
          where: { lastScrapedAt: { not: null } },
          orderBy: { lastScrapedAt: 'desc' },
          take: 10,
          select: {
            username: true,
            platform: true,
            followers: true,
            profilePicUrl: true,
            lastScrapedAt: true,
          },
        }),
      ]);

      return {
        totals: { influencers: totalInfluencers, posts: totalPosts },
        jobs: {
          pending: pendingJobs,
          completed: completedJobs,
          failed: failedJobs,
        },
        platforms: platformBreakdown.map((p) => ({
          platform: p.platform,
          influencers: p._count._all,
          followers: p._sum.followers || 0,
        })),
        topByFollowers,
        topByEngagement,
        recentlyScraped,
      };
    },
    60
  );

  res.json(data);
}

module.exports = { summary };
