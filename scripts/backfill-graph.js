'use strict';

/*
 * One-shot Postgres → Neo4j backfill.
 *
 * Mirrors every existing Influencer + Follower + Following row into the
 * graph using the same graph.service the live worker uses, so the schema
 * stays identical (constraints, ON CREATE timestamps, FOLLOWS edges).
 *
 * Idempotent — every Cypher write is a MERGE, so re-running is safe and
 * just bumps `lastSeen` timestamps. Use this after first deploying
 * Neo4j alongside an already-populated Postgres, or whenever you want
 * to reconcile the graph back to the source-of-truth Postgres state.
 *
 * Run inside the worker container so it shares the docker network with
 * neo4j and uses the same env (DATABASE_URL, NEO4J_*):
 *
 *   docker compose exec worker node scripts/backfill-graph.js
 *
 * Optional flags:
 *   --skip-influencers  skip the Profile-only pass
 *   --skip-followers    skip mirroring followers → FOLLOWS edges
 *   --skip-following    skip mirroring following → FOLLOWS edges
 *   --batch=500         rows per Cypher call (default 500)
 */

const prisma = require('../src/prisma/client');
const graph  = require('../src/services/graph.service');
const logger = require('../src/utils/logger');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const m = args.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split('=')[1] : fallback;
};

const BATCH = parseInt(value('batch', 500), 10);
const SKIP_INF = flag('skip-influencers');
const SKIP_FERS = flag('skip-followers');
const SKIP_FING = flag('skip-following');

function fmt(n) { return n.toLocaleString(); }

async function ensureGraphUp() {
  const driver = await graph.getDriver();
  if (!driver) {
    throw new Error(
      'Neo4j is unavailable. Check NEO4J_URI / NEO4J_PASSWORD and that the neo4j service is healthy.'
    );
  }
}

// ===== Pass 1: tracked Influencers → :Profile (tracked=true) ==============
async function backfillInfluencers() {
  if (SKIP_INF) {
    logger.info('skipping influencers pass (--skip-influencers)');
    return { mirrored: 0 };
  }
  const total = await prisma.influencer.count();
  logger.info({ total }, 'pass 1/3 — mirroring tracked influencers');

  let cursor = null;
  let mirrored = 0;

  while (true) {
    const rows = await prisma.influencer.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (!rows.length) break;

    // graph.mirrorInfluencer expects one influencer at a time. That's fine
    // here — 142 calls is nothing, and we get accurate per-row mirroring
    // (uses the same write path the live scrape worker uses).
    for (const inf of rows) {
      await graph.mirrorInfluencer(inf);
      mirrored++;
    }

    cursor = rows[rows.length - 1].id;
    logger.info({ mirrored, total, pct: ((mirrored / total) * 100).toFixed(1) }, '  influencers progress');
  }
  return { mirrored };
}

// ===== Pass 2: Followers → FOLLOWS edges ==================================
//
// The Follower table stores `(influencerId, username)` tuples — the
// follower-side `username` becomes a non-tracked Profile, the influencer
// is the target. We re-fetch (platform, username) for each influencer once
// to feed mirrorFollowers, then stream that influencer's followers in
// pages of BATCH rows.
async function backfillFollowers() {
  if (SKIP_FERS) {
    logger.info('skipping followers pass (--skip-followers)');
    return { mirrored: 0, edges: 0 };
  }

  const totalEdges = await prisma.follower.count();
  logger.info({ totalEdges }, 'pass 2/3 — mirroring follower edges');

  // Drive off actual table contents — `followersFetched` on Influencer is
  // a denormalized counter that's been historically inconsistent (e.g. on
  // pre-migration rows). Source-of-truth is the followers table itself.
  const distinct = await prisma.follower.findMany({
    distinct: ['influencerId'],
    select: { influencerId: true },
  });
  const ids = distinct.map((r) => r.influencerId);
  const influencers = await prisma.influencer.findMany({
    select: { id: true, platform: true, username: true },
    where: { id: { in: ids } },
  });

  let mirroredEdges = 0;
  let influencersDone = 0;

  for (const inf of influencers) {
    let cursor = null;
    while (true) {
      const rows = await prisma.follower.findMany({
        where: { influencerId: inf.id },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (!rows.length) break;
      await graph.mirrorFollowers(inf.platform, inf.username, rows);
      mirroredEdges += rows.length;
      cursor = rows[rows.length - 1].id;
    }
    influencersDone++;
    if (influencersDone % 10 === 0 || influencersDone === influencers.length) {
      logger.info(
        {
          influencer: `${inf.platform}/${inf.username}`,
          influencersDone,
          ofInfluencers: influencers.length,
          mirroredEdges,
          pct: ((mirroredEdges / totalEdges) * 100).toFixed(1),
        },
        '  followers progress'
      );
    }
  }
  return { mirrored: mirroredEdges, edges: mirroredEdges };
}

// ===== Pass 3: Following → FOLLOWS edges (reverse direction) ==============
async function backfillFollowing() {
  if (SKIP_FING) {
    logger.info('skipping following pass (--skip-following)');
    return { mirrored: 0, edges: 0 };
  }

  const totalEdges = await prisma.following.count();
  logger.info({ totalEdges }, 'pass 3/3 — mirroring following edges');

  // Same as pass 2 — source-of-truth is the table, not the cached counter.
  const distinct = await prisma.following.findMany({
    distinct: ['influencerId'],
    select: { influencerId: true },
  });
  const ids = distinct.map((r) => r.influencerId);
  const influencers = await prisma.influencer.findMany({
    select: { id: true, platform: true, username: true },
    where: { id: { in: ids } },
  });

  let mirroredEdges = 0;
  let influencersDone = 0;

  for (const inf of influencers) {
    let cursor = null;
    while (true) {
      const rows = await prisma.following.findMany({
        where: { influencerId: inf.id },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (!rows.length) break;
      await graph.mirrorFollowing(inf.platform, inf.username, rows);
      mirroredEdges += rows.length;
      cursor = rows[rows.length - 1].id;
    }
    influencersDone++;
    if (influencersDone % 10 === 0 || influencersDone === influencers.length) {
      logger.info(
        {
          influencer: `${inf.platform}/${inf.username}`,
          influencersDone,
          ofInfluencers: influencers.length,
          mirroredEdges,
          pct: ((mirroredEdges / totalEdges) * 100).toFixed(1),
        },
        '  following progress'
      );
    }
  }
  return { mirrored: mirroredEdges, edges: mirroredEdges };
}

(async () => {
  const startedAt = Date.now();
  logger.info({ batch: BATCH, skipInf: SKIP_INF, skipFers: SKIP_FERS, skipFing: SKIP_FING }, 'graph backfill: starting');

  try {
    await ensureGraphUp();

    const r1 = await backfillInfluencers();
    const r2 = await backfillFollowers();
    const r3 = await backfillFollowing();

    const stats = await graph.stats();

    const tookMs = Date.now() - startedAt;
    logger.info(
      {
        influencersMirrored: r1.mirrored,
        followerEdges: r2.mirrored,
        followingEdges: r3.mirrored,
        totalGraphProfiles: stats?.profiles ?? '?',
        totalGraphEdges:    stats?.edges    ?? '?',
        durationSec: Math.round(tookMs / 1000),
      },
      '✓ graph backfill: complete'
    );

    console.log('\n=== Summary ===');
    console.log(`influencers mirrored : ${fmt(r1.mirrored)}`);
    console.log(`follower edges       : ${fmt(r2.mirrored)}`);
    console.log(`following edges      : ${fmt(r3.mirrored)}`);
    console.log(`total in graph       : ${fmt(stats?.profiles || 0)} profiles · ${fmt(stats?.edges || 0)} edges`);
    console.log(`took                 : ${(tookMs / 1000).toFixed(1)}s`);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'graph backfill: failed');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await graph.shutdown();
  }
})();
