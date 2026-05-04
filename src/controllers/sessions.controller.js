'use strict';

const prisma = require('../prisma/client');
const ApiError = require('../utils/ApiError');
const igPool = require('../scraper/ig.pool');

// Mask cookie/sessionid values in API responses — they're long-lived
// credentials and there's no reason to send them back to the client after
// they've been saved.
const SECRET_PREFIX_LEN = 6;
const maskSecret = (s) => {
  if (!s) return null;
  if (s.length <= SECRET_PREFIX_LEN + 4) return `${'*'.repeat(s.length)}`;
  return `${s.slice(0, SECRET_PREFIX_LEN)}…${s.slice(-4)}`;
};

const toResponse = (row) => ({
  id: row.id,
  label: row.label,
  sessionid: maskSecret(row.sessionid),
  dsUserId: row.dsUserId,                    // not secret enough to mask
  cookies: maskSecret(row.cookies),
  wwwClaim: maskSecret(row.wwwClaim),
  enabled: row.enabled,
  cold: row.cold,
  cooldownEndsAt: row.cooldownEndsAt,
  lastUsedAt: row.lastUsedAt,
  hasFullJar: !!row.cookies && !!row.wwwClaim,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

// GET /sessions
const listSessions = async (_req, res) => {
  const rows = await prisma.igSession.findMany({ orderBy: { createdAt: 'asc' } });
  // Status from in-memory pool — gives the actual cooldown state the worker
  // is currently using (DB row may lag if pool just hot-marked it).
  const live = new Map(igPool.status().map((s) => [s.id, s]));
  res.json({
    items: rows.map((r) => {
      const inPool = live.get(r.id);
      return {
        ...toResponse(r),
        inPool: !!inPool,
        cold: inPool ? inPool.cold : r.cold,
        cooldownEndsAt: inPool ? inPool.cooldownEndsAt : r.cooldownEndsAt,
      };
    }),
    poolSnapshot: igPool.status(),
    lastLoadedAt: new Date(igPool.lastLoadedAt).toISOString(),
  });
};

const validateInput = (body) => {
  const { sessionid, cookies } = body || {};
  if (!sessionid && !cookies) {
    throw new ApiError(
      400,
      'Need either `sessionid` (minimum) or `cookies` (full jar — preferred for paginated endpoints).',
      ['Open instagram.com → DevTools → Application → Cookies → copy the "sessionid" value, or the entire Cookie header from any /api/v1/* request.']
    );
  }
};

// POST /sessions
const createSession = async (req, res) => {
  validateInput(req.body);
  const row = await prisma.igSession.create({
    data: {
      label:     req.body.label || null,
      sessionid: req.body.sessionid || null,
      dsUserId:  req.body.dsUserId  || null,
      cookies:   req.body.cookies   || null,
      wwwClaim:  req.body.wwwClaim  || null,
      enabled:   req.body.enabled !== false,
    },
  });
  // Hot-reload so the worker pool picks up the new session immediately
  // instead of waiting for the 30s background refresh.
  igPool.reload().catch(() => {});
  res.status(201).json(toResponse(row));
};

// PATCH /sessions/:id — partial update. Empty string clears a field.
const updateSession = async (req, res) => {
  const { id } = req.params;
  const data = {};
  for (const k of ['label', 'sessionid', 'dsUserId', 'cookies', 'wwwClaim']) {
    if (k in req.body) data[k] = req.body[k] || null;
  }
  if ('enabled' in req.body) data.enabled = !!req.body.enabled;
  // Resetting `cold` lets the user manually warm a session up after rotating
  // its cookies (the cooldown was set on the OLD cookie value).
  if (req.body.warmUp === true) {
    data.cold = false;
    data.cooldownEndsAt = null;
  }

  const row = await prisma.igSession.update({ where: { id }, data }).catch((err) => {
    if (err.code === 'P2025') throw new ApiError(404, 'Session not found');
    throw err;
  });
  igPool.reload().catch(() => {});
  res.json(toResponse(row));
};

// DELETE /sessions/:id
const deleteSession = async (req, res) => {
  const { id } = req.params;
  await prisma.igSession.delete({ where: { id } }).catch((err) => {
    if (err.code === 'P2025') throw new ApiError(404, 'Session not found');
    throw err;
  });
  igPool.reload().catch(() => {});
  res.status(204).end();
};

// POST /sessions/reload — force a pool refresh (mostly for diagnostics).
const reloadSessions = async (_req, res) => {
  await igPool.reload();
  res.json({ count: igPool.SESSIONS.length, lastLoadedAt: new Date(igPool.lastLoadedAt).toISOString() });
};

module.exports = {
  listSessions,
  createSession,
  updateSession,
  deleteSession,
  reloadSessions,
};
