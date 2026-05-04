'use strict';

const logger = require('../utils/logger');
const prisma = require('../prisma/client');
const { buildIgHeaders, buildGraphqlHeaders, IG_APP_ID } = require('./instagram.headers');
const { pickSession, markCold } = require('./ig.pool');

// IG's modern web profile posts endpoint. Used by instagram.com itself —
// see the network panel on a profile page → POST /graphql/query with
// `fb_api_req_friendly_name=PolarisProfilePostsTabContentQuery_connection`.
//
// Cursor pagination via `variables.after` (server returns `end_cursor` in
// `page_info`). More reliable than the legacy `/api/v1/feed/user/{id}/`
// endpoint, which IG has been throttling more aggressively.
const GRAPHQL_URL = 'https://www.instagram.com/graphql/query';
const FRIENDLY_NAME = 'PolarisProfilePostsTabContentQuery_connection';
// `doc_id` is the persisted-query hash IG ships with PolarisProfilePostsTabRoute.
// Override via env if IG rolls a new value.
const DEFAULT_DOC_ID = process.env.IG_POSTS_DOC_ID || '26605367369131467';

const PAGE_DELAY_MIN_MS = 1500;
const PAGE_DELAY_MAX_MS = 3500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () =>
  PAGE_DELAY_MIN_MS + Math.floor(Math.random() * (PAGE_DELAY_MAX_MS - PAGE_DELAY_MIN_MS));

const parseCount = (n) => (typeof n === 'number' ? n : 0);

// ===== Token extraction =====================================================
// `fb_dtsg`, `lsd`, `jazoest` are baked into IG's profile HTML. We pull them
// per-session and cache for 5 minutes — they don't rotate per-request, but
// they do drift over the lifetime of a session.
const tokenCache = new Map(); // sessionId -> { fb_dtsg, lsd, jazoest, fetchedAt }
const TOKEN_TTL_MS = 5 * 60 * 1000;

const stripQuotes = (s) => (s ? s.replace(/^"|"$/g, '') : s);

const extractTokens = (html) => {
  // The HTML inlines a JS bootstrap blob; these are the most stable matchers
  // I've seen across renders. Any one missing is a soft failure — we attempt
  // the call anyway since IG has been known to accept partial values.
  const dtsg =
    html.match(/"DTSGInitialData",\s*\[\s*\],\s*\{\s*"token"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"fb_dtsg"\s*:\s*\{\s*"value"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1] ||
    null;

  const lsd =
    html.match(/"LSD",\s*\[\s*\],\s*\{\s*"token"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"lsd"\s*:\s*\{\s*"token"\s*:\s*"([^"]+)"/)?.[1] ||
    null;

  const jazoest =
    html.match(/"jazoest"\s*:\s*"(\d+)"/)?.[1] ||
    html.match(/name="jazoest"\s+value="(\d+)"/)?.[1] ||
    null;

  // `av` is the IG actor PK. IG's GraphQL handler 403s when this is `0` for
  // a request whose cookies represent a logged-in user (mismatch). The PK is
  // baked into the HTML bootstrap multiple times under several names —
  // pull whichever one matches first.
  const av =
    html.match(/"actorID"\s*:\s*"(\d+)"/)?.[1] ||
    html.match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] ||
    html.match(/"viewerActorID"\s*:\s*"(\d+)"/)?.[1] ||
    html.match(/"viewer"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/)?.[1] ||
    html.match(/"__user"\s*:\s*"(\d+)"/)?.[1] ||
    null;

  return { fb_dtsg: stripQuotes(dtsg), lsd: stripQuotes(lsd), jazoest, av };
};

const getTokens = async ({ username, session }) => {
  const cacheKey = session?.id || 'anon';
  const cached = tokenCache.get(cacheKey);
  if (cached && (Date.now() - cached.fetchedAt) < TOKEN_TTL_MS && cached.fb_dtsg) {
    return cached;
  }

  const headers = {
    ...buildIgHeaders({ referer: 'https://www.instagram.com/', session }),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    // Re-set Sec-Fetch headers for an HTML doc request (different from XHR).
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
  // Drop XHR-only headers that confuse the HTML doc request.
  delete headers['X-Requested-With'];
  delete headers['X-Asbd-Id'];

  const res = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = new Error(`profile HTML fetch failed: HTTP ${res.status}`);
    err.code = 'TOKENS_HTTP';
    throw err;
  }
  const html = await res.text();
  const tokens = extractTokens(html);
  if (!tokens.fb_dtsg || !tokens.lsd) {
    const err = new Error('Could not extract fb_dtsg/lsd from profile HTML — IG layout changed?');
    err.code = 'TOKENS_PARSE';
    throw err;
  }
  const entry = { ...tokens, fetchedAt: Date.now() };
  tokenCache.set(cacheKey, entry);
  return entry;
};

// ===== Post node mapping ====================================================
// IG returns the per-post view count under several different field names
// over time, and for carousels the parent often has `null` while one of the
// children carries the count. Walk all the spots we know about; first hit
// wins. Returns null (instead of 0) when the post genuinely has no viewable
// counter — distinguishes "no data" from a real "0 views" in the metrics.
const extractViews = (node) => {
  if (typeof node.play_count === 'number')       return node.play_count;
  if (typeof node.view_count === 'number')       return node.view_count;
  if (typeof node.video_view_count === 'number') return node.video_view_count;
  if (typeof node.ig_play_count === 'number')    return node.ig_play_count;

  // Carousels: a single video child can carry the count even when the
  // outer node hides it. Take the first child that exposes one.
  const carousel = Array.isArray(node.carousel_media) ? node.carousel_media : [];
  for (const child of carousel) {
    if (typeof child.play_count === 'number')       return child.play_count;
    if (typeof child.view_count === 'number')       return child.view_count;
    if (typeof child.video_view_count === 'number') return child.video_view_count;
  }
  return null;
};

const mapNode = (node) => {
  const code = node.code || node.shortcode || null;
  const isVideo = node.media_type === 2 || !!node.video_versions;
  const isCarousel = node.media_type === 8 || Array.isArray(node.carousel_media);
  const ts = node.taken_at;
  const views = extractViews(node);
  return {
    shortcode: code,
    likes: parseCount(node.like_count),
    comments: parseCount(node.comment_count),
    views: views == null ? null : parseCount(views),
    caption: node.caption?.text || null,
    postedAt: ts ? new Date(ts * 1000) : null,
    mediaType: isVideo ? 'video' : isCarousel ? 'carousel' : 'image',
    mediaUrl: node.image_versions2?.candidates?.[0]?.url || null,
    permalink: code ? `https://www.instagram.com/p/${code}/` : null,
  };
};

const upsertPosts = async (influencerId, items) => {
  for (const p of items) {
    if (!p.shortcode) continue;
    await prisma.post.upsert({
      where: { shortcode: p.shortcode },
      create: { influencerId, ...p },
      update: {
        likes: p.likes, comments: p.comments, views: p.views,
        caption: p.caption, mediaType: p.mediaType,
        mediaUrl: p.mediaUrl, permalink: p.permalink,
      },
    }).catch((err) => {
      logger.warn({ shortcode: p.shortcode, err: err.message }, 'post upsert failed');
    });
  }
};

// ===== GraphQL request ======================================================
// Variables block mirrors what IG's web client sends from the profile posts
// tab. `after` is the cursor returned by `page_info.end_cursor` on the
// previous page (or null on the first request).
const buildVariables = ({ username, after }) => ({
  after: after || null,
  before: null,
  data: {
    count: 12,
    include_reel_media_seen_timestamp: true,
    include_relationship_info: true,
    latest_besties_reel_media: true,
    latest_reel_media: true,
  },
  first: 12,
  last: null,
  username,
  __relay_internal__pv__PolarisImmersiveFeedChainingEnabledrelayprovider: false,
});

// Form-encoded body. Parameters that are not strictly required by the
// endpoint (the `__d` / `__user` / `__hs` / `__rev` / `__crn` / `__dyn` /
// `__csr` / `__hsdp` / `__hblp` / `__sjsp` / `__spin_*` family) are FB
// dynamic-loader / telemetry hints — IG's GraphQL handler ignores them.
const buildBody = ({ tokens, variables }) =>
  new URLSearchParams({
    // `av` is the IG actor PK extracted from the profile HTML bootstrap.
    // Falls back to '0' (anonymous) when the page didn't expose it — that
    // path 403s for logged-in sessions but works for purely-public probes.
    av: tokens.av || '0',
    fb_dtsg: tokens.fb_dtsg,
    lsd: tokens.lsd,
    jazoest: tokens.jazoest || '0',
    fb_api_req_friendly_name: FRIENDLY_NAME,
    fb_api_caller_class: 'RelayModern',
    doc_id: DEFAULT_DOC_ID,
    server_timestamps: 'true',
    variables: JSON.stringify(variables),
  });

const fetchPostsPage = async ({ username, session, after }) => {
  const tokens = await getTokens({ username, session });

  const headers = buildGraphqlHeaders({
    session,
    referer: `https://www.instagram.com/${encodeURIComponent(username)}/`,
    tokens,
    friendlyName: FRIENDLY_NAME,
    rootFieldName: 'xdt_api__v1__feed__user_timeline_graphql_connection',
  });
  const body = buildBody({ tokens, variables: buildVariables({ username, after }) });

  return fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });
};

// IG's GraphQL endpoint requires `x-csrftoken` derived from the `csrftoken`
// cookie in the jar. A bare-sessionid session (no full cookies pasted) will
// always 403 here — fail fast with a clear, fixable message.
const requiresFullCookieJar = (session) => {
  if (!session?.cookies) return true;
  return !/(?:^|; )csrftoken=/i.test(session.cookies);
};

// ===== Paginated walker =====================================================
const scrapePosts = async ({
  influencerId, username, max = 30, startCursor = null, onProgress,
}) => {
  let session = pickSession();

  if (!session) {
    return {
      fetched: 0, pages: 0, blocked: true, nextCursor: startCursor || null,
      blockedReason: 'No Instagram session configured. Add one at /v2/sessions.',
    };
  }
  if (requiresFullCookieJar(session)) {
    return {
      fetched: 0, pages: 0, blocked: true, nextCursor: startCursor || null,
      blockedReason:
        'Posts fetch requires the FULL Cookie header (with csrftoken) — bare sessionid is not enough. ' +
        'Open /v2/sessions, EDIT the session, and paste the full Cookie value from instagram.com DevTools ' +
        '→ Network → any /api/v1/* request → Request Headers → Cookie.',
    };
  }

  let cursor = startCursor || null;
  let fetched = 0;
  let pages = 0;
  let blocked = false;
  let blockedReason = null;

  while (fetched < max) {
    pages += 1;

    let res;
    try {
      res = await fetchPostsPage({ username, session, after: cursor });
    } catch (err) {
      logger.warn({ username, page: pages, err: err.message, code: err.code }, 'graphql posts threw');
      blocked = true; blockedReason = err.message;
      break;
    }

    if (res.status === 429) {
      markCold(session?.id);
      const next = pickSession();
      if (next && next.id !== session?.id) {
        logger.info({ username, page: pages, from: session?.id, to: next.id }, 'rotating session after 429');
        session = next;
        pages -= 1;
        continue;
      }
      blocked = true; blockedReason = 'HTTP 429 — all sessions cooling';
      break;
    }
    if ([401, 403].includes(res.status)) {
      blocked = true; blockedReason = `HTTP ${res.status}`;
      break;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      blocked = true; blockedReason = `HTTP ${res.status}: ${text.slice(0, 100)}`;
      break;
    }

    let json;
    try { json = await res.json(); }
    catch { blocked = true; blockedReason = 'non-json response'; break; }

    const conn = json?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
    const edges = Array.isArray(conn?.edges) ? conn.edges : [];
    if (!edges.length) break;

    const batch = edges.slice(0, max - fetched).map((e) => mapNode(e.node || {}));
    if (batch.length) await upsertPosts(influencerId, batch);

    fetched += batch.length;
    if (typeof onProgress === 'function') {
      await onProgress({ fetched, lastBatch: batch.length, pages, sessionId: session?.id });
    }

    cursor = conn?.page_info?.end_cursor || null;
    const hasNext = !!conn?.page_info?.has_next_page;
    if (!hasNext || !cursor) break;
    if (fetched >= max) break;
    await sleep(jitter());
  }

  return { fetched, pages, blocked, blockedReason, nextCursor: cursor };
};

module.exports = { scrapePosts, IG_APP_ID };
