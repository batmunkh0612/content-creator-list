'use strict';

const neo4j = require('neo4j-driver');
const logger = require('../utils/logger');

// Best-effort Neo4j mirror. Every write is wrapped — if Neo4j is down or
// misconfigured, the call logs and returns null instead of throwing, so the
// Postgres write path stays untouched.
//
// Schema (single label, edges keep firstSeen/lastSeen for historical queries):
//
//   (:Profile {platform, username, fullName, profilePicUrl, followers,
//              following, postsCount, engagementRate, isVerified, isPrivate,
//              tracked, firstSeen, updatedAt})
//   -[:FOLLOWS {firstSeen, lastSeen, firstSeenAt, lastSeenAt}]->
//   (:Profile)
//
// `tracked: true` for profiles we scrape directly; `tracked: false` for
// profiles only seen as someone's follower or following.

const URI  = process.env.NEO4J_URI || 'bolt://neo4j:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASS = process.env.NEO4J_PASSWORD || 'changeme123';

let driver = null;
let constraintsApplied = false;
let connectAttempted = false;

async function getDriver() {
  if (driver) return driver;
  if (connectAttempted) return null; // retry once per process boot at most
  connectAttempted = true;
  try {
    const d = neo4j.driver(URI, neo4j.auth.basic(USER, PASS), {
      connectionTimeout: 5_000,
      maxTransactionRetryTime: 5_000,
    });
    await d.verifyConnectivity();
    driver = d;
    logger.info({ uri: URI }, 'neo4j: connected');
    if (!constraintsApplied) {
      await ensureConstraints(d);
      constraintsApplied = true;
    }
    return d;
  } catch (err) {
    logger.warn({ err: err.message }, 'neo4j: unavailable — graph mirror disabled');
    return null;
  }
}

async function ensureConstraints(d) {
  const session = d.session();
  try {
    await session.run(
      `CREATE CONSTRAINT profile_id IF NOT EXISTS
         FOR (p:Profile) REQUIRE (p.platform, p.username) IS UNIQUE`
    );
    // Index on `tracked` so the network-graph query can quickly find the
    // workspace's tracked influencers as anchors.
    await session.run(
      `CREATE INDEX profile_tracked IF NOT EXISTS FOR (p:Profile) ON (p.tracked)`
    );
    logger.info('neo4j: constraints + indexes ensured');
  } finally {
    await session.close();
  }
}

async function withSession(fn) {
  const d = await getDriver();
  if (!d) return null;
  const sess = d.session();
  try {
    return await fn(sess);
  } catch (err) {
    logger.warn({ err: err.message }, 'neo4j write failed (non-fatal)');
    return null;
  } finally {
    await sess.close();
  }
}

/** Upsert a tracked Profile node from a fresh influencer scrape. */
async function mirrorInfluencer(inf) {
  if (!inf?.username || !inf?.platform) return null;
  return withSession((s) =>
    s.run(
      `MERGE (p:Profile {platform: $platform, username: $username})
       ON CREATE SET p.firstSeen = datetime()
       SET p.tracked = true,
           p.fullName = $fullName,
           p.followers = $followers,
           p.following = $following,
           p.postsCount = $postsCount,
           p.engagementRate = $engagementRate,
           p.isVerified = $isVerified,
           p.profilePicUrl = $profilePicUrl,
           p.updatedAt = datetime()
       RETURN p`,
      {
        platform: inf.platform,
        username: inf.username,
        fullName: inf.fullName || null,
        followers: neo4j.int(inf.followers || 0),
        following: neo4j.int(inf.following || 0),
        postsCount: neo4j.int(inf.postsCount || 0),
        engagementRate: Number(inf.engagementRate || 0),
        isVerified: !!inf.isVerified,
        profilePicUrl: inf.profilePicUrl || null,
      }
    )
  );
}

/**
 * Bulk-mirror a page of follower rows. `target` is the influencer being
 * followed. Each row becomes a Profile node (tracked=false) and a
 * FOLLOWS edge: row -> target.
 */
async function mirrorFollowers(targetPlatform, targetUsername, rows) {
  if (!rows?.length) return null;
  const cleanRows = rows.map((r) => ({
    username: r.username,
    fullName: r.fullName || null,
    profilePicUrl: r.profilePicUrl || null,
    isVerified: !!r.isVerified,
    isPrivate: !!r.isPrivate,
  }));
  return withSession((s) =>
    s.executeWrite(async (tx) => {
      // Upsert nodes (tracked=false; doesn't overwrite existing tracked=true).
      await tx.run(
        `UNWIND $rows AS row
         MERGE (p:Profile {platform: $platform, username: row.username})
         ON CREATE SET p.firstSeen = datetime(), p.tracked = false
         SET p.fullName = coalesce(row.fullName, p.fullName),
             p.profilePicUrl = coalesce(row.profilePicUrl, p.profilePicUrl),
             p.isVerified = row.isVerified,
             p.isPrivate = row.isPrivate`,
        { platform: targetPlatform, rows: cleanRows }
      );
      // Upsert edges with first/last-seen timestamps.
      await tx.run(
        `MATCH (target:Profile {platform: $platform, username: $targetUsername})
         UNWIND $rows AS row
         MATCH (src:Profile {platform: $platform, username: row.username})
         MERGE (src)-[r:FOLLOWS]->(target)
         ON CREATE SET r.firstSeen = datetime(), r.firstSeenAt = datetime()
         SET r.lastSeen = datetime(), r.lastSeenAt = datetime()`,
        { platform: targetPlatform, targetUsername, rows: cleanRows }
      );
    })
  );
}

/**
 * Bulk-mirror a page of "following" rows: source -> each row.
 */
async function mirrorFollowing(sourcePlatform, sourceUsername, rows) {
  if (!rows?.length) return null;
  const cleanRows = rows.map((r) => ({
    username: r.username,
    fullName: r.fullName || null,
    profilePicUrl: r.profilePicUrl || null,
    isVerified: !!r.isVerified,
    isPrivate: !!r.isPrivate,
  }));
  return withSession((s) =>
    s.executeWrite(async (tx) => {
      await tx.run(
        `UNWIND $rows AS row
         MERGE (p:Profile {platform: $platform, username: row.username})
         ON CREATE SET p.firstSeen = datetime(), p.tracked = false
         SET p.fullName = coalesce(row.fullName, p.fullName),
             p.profilePicUrl = coalesce(row.profilePicUrl, p.profilePicUrl),
             p.isVerified = row.isVerified,
             p.isPrivate = row.isPrivate`,
        { platform: sourcePlatform, rows: cleanRows }
      );
      await tx.run(
        `MATCH (source:Profile {platform: $platform, username: $sourceUsername})
         UNWIND $rows AS row
         MATCH (dst:Profile {platform: $platform, username: row.username})
         MERGE (source)-[r:FOLLOWS]->(dst)
         ON CREATE SET r.firstSeen = datetime(), r.firstSeenAt = datetime()
         SET r.lastSeen = datetime(), r.lastSeenAt = datetime()`,
        { platform: sourcePlatform, sourceUsername, rows: cleanRows }
      );
    })
  );
}

/** Stats for /health/graph or admin pages. */
async function stats() {
  return withSession(async (s) => {
    const r = await s.run(
      `MATCH (p:Profile) WITH count(p) AS profiles
       OPTIONAL MATCH (:Profile)-[r:FOLLOWS]->(:Profile)
       RETURN profiles, count(r) AS edges`
    );
    const row = r.records[0];
    return {
      profiles: row?.get('profiles')?.toNumber?.() ?? 0,
      edges:    row?.get('edges')?.toNumber?.()    ?? 0,
    };
  });
}

async function shutdown() {
  if (driver) {
    try { await driver.close(); } catch {}
    driver = null;
  }
}

module.exports = {
  mirrorInfluencer,
  mirrorFollowers,
  mirrorFollowing,
  stats,
  shutdown,
  getDriver,
};
