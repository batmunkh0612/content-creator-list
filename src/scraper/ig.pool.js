'use strict';

const logger = require('../utils/logger');
const prisma = require('../prisma/client');

/**
 * Multi-session pool for Instagram. Sources of sessions, in priority order:
 *
 *   1. `ig_sessions` table (managed via the frontend / `/sessions` API)
 *   2. Env vars — IG_COOKIES*, IG_WWW_CLAIM*, IG_SESSIONID*, IG_DS_USER_ID*
 *      (suffixes empty/_1.._9). Used only when the table is empty so legacy
 *      .env-driven setups keep working until the user adds their first
 *      DB-backed session.
 *
 * The pool keeps an in-memory snapshot refreshed every 30s in the background
 * so `pickSession()` stays synchronous (callers are tight scraper loops).
 * `markCold()` writes through to Postgres so a cold session stays cold even
 * after worker restarts.
 *
 * Round-robins among non-cooled-down sessions. On HTTP 429 the caller marks
 * the session cold for 30 min; the next pick skips it.
 */

const COOLDOWN_MS = 30 * 60 * 1000;
const REFRESH_MS  = 30 * 1000;

const stripQuotes = (s) => {
  if (!s) return s;
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
};

const readEnvSession = (suffix) => {
  const cookies   = stripQuotes((process.env[`IG_COOKIES${suffix}`]   || '').trim());
  const wwwClaim  = stripQuotes((process.env[`IG_WWW_CLAIM${suffix}`] || '').trim());
  const sessionid = (process.env[`IG_SESSIONID${suffix}`]             || '').trim();
  const dsUserId  = (process.env[`IG_DS_USER_ID${suffix}`]            || '').trim();
  if (!cookies && !sessionid) return null;
  return {
    id: suffix ? `env-s${suffix.replace('_', '')}` : 'env-default',
    cookies, wwwClaim, sessionid, dsUserId,
    hasFullJar: !!cookies && !!wwwClaim,
    source: 'env',
    cold: false, cooldownEndsAt: 0,
  };
};

const loadEnvSessions = () => {
  const out = [];
  const def = readEnvSession('');
  if (def) out.push(def);
  for (let i = 1; i <= 9; i += 1) {
    const s = readEnvSession(`_${i}`);
    if (s) out.push(s);
  }
  return out;
};

const dbRowToSession = (row) => ({
  id: row.id,
  label: row.label || null,
  cookies: row.cookies || '',
  wwwClaim: row.wwwClaim || '',
  sessionid: row.sessionid || '',
  dsUserId: row.dsUserId || '',
  hasFullJar: !!row.cookies && !!row.wwwClaim,
  source: 'db',
  cold: !!row.cold,
  cooldownEndsAt: row.cooldownEndsAt ? new Date(row.cooldownEndsAt).getTime() : 0,
});

let SESSIONS = [];
let rrIndex = 0;
let lastLoadedAt = 0;

const reload = async () => {
  try {
    const rows = await prisma.igSession.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length) {
      SESSIONS = rows.map(dbRowToSession);
    } else {
      // Bootstrap path: first run before anyone added a session via UI.
      SESSIONS = loadEnvSessions();
    }
    lastLoadedAt = Date.now();
    logger.info(
      { count: SESSIONS.length, ids: SESSIONS.map((s) => `${s.id}${s.hasFullJar ? '+claim' : ''}`) },
      'IG pool: sessions loaded'
    );
  } catch (err) {
    // DB hiccup — keep whatever we had so the worker doesn't grind to a halt.
    logger.warn({ err: err.message }, 'IG pool: reload failed, keeping previous snapshot');
  }
};

// Initial load + periodic refresh.
reload();
setInterval(() => { reload().catch(() => {}); }, REFRESH_MS);

const pickSession = () => {
  if (!SESSIONS.length) return null;
  const now = Date.now();
  const live = SESSIONS.filter((s) => {
    if (s.cooldownEndsAt && s.cooldownEndsAt > now) return false;
    return !s.cold;
  });

  if (!live.length) {
    // All cold — return the one closest to recovery. Caller decides whether
    // to retry or fail fast.
    return SESSIONS.reduce((a, b) =>
      (a.cooldownEndsAt || 0) <= (b.cooldownEndsAt || 0) ? a : b
    );
  }

  const s = live[rrIndex % live.length];
  rrIndex += 1;
  return s;
};

const markCold = (sessionId, ms = COOLDOWN_MS) => {
  if (!sessionId) return;
  const until = Date.now() + ms;
  // Update in-memory snapshot immediately so the next pick skips it.
  for (const s of SESSIONS) {
    if (s.id === sessionId) {
      s.cold = true;
      s.cooldownEndsAt = until;
      break;
    }
  }
  // Persist to DB so a worker restart preserves the cooldown. Only
  // applicable to DB-backed sessions; env-sourced sessions have no row.
  if (sessionId.startsWith('env-')) return;
  prisma.igSession.update({
    where: { id: sessionId },
    data: { cold: true, cooldownEndsAt: new Date(until) },
  }).catch((err) => logger.warn({ err: err.message, sessionId }, 'IG pool: cold persist failed'));
  logger.warn(
    { sessionId, untilIso: new Date(until).toISOString() },
    'IG pool: session marked cold'
  );
};

const status = () => {
  const now = Date.now();
  return SESSIONS.map((s) => ({
    id: s.id,
    label: s.label,
    source: s.source,
    hasFullJar: s.hasFullJar,
    cold: !!s.cold && s.cooldownEndsAt > now,
    cooldownEndsAt: s.cooldownEndsAt ? new Date(s.cooldownEndsAt).toISOString() : null,
  }));
};

module.exports = {
  pickSession,
  markCold,
  status,
  reload,
  COOLDOWN_MS,
  // SESSIONS is exported for diagnostics; do not mutate from callers.
  get SESSIONS() { return SESSIONS; },
  get lastLoadedAt() { return lastLoadedAt; },
};
