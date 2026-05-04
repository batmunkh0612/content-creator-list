'use strict';

const { launchContext, randomDelay } = require('./browser');
const { parseCount, trimCaption } = require('../utils/normalize');
const {
  extractJsonScripts,
  extractMeta,
  findInJson,
  parseCountsFromText,
} = require('./_extractor');
const { buildIgHeaders } = require('./instagram.headers');
const { pickSession, markCold } = require('./ig.pool');
const logger = require('../utils/logger');
const env = require('../config/env');

const PLATFORM = 'instagram';
const PROFILE_URL = (u) => `https://www.instagram.com/${u}/`;

// Use www.instagram.com (matches the browser) — i.instagram.com works too
// but some endpoints reject anonymous calls there.
const IG_API_URL = (u) =>
  `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`;

// Match the modern profile node shape. We deep-walk every embedded JSON
// blob until we hit a node that looks like a profile.
function looksLikeProfileNode(n) {
  return (
    n &&
    typeof n.username === 'string' &&
    n.edge_followed_by &&
    typeof n.edge_followed_by.count === 'number'
  );
}

function buildPostsFromGraph(node) {
  const edges =
    node?.edge_owner_to_timeline_media?.edges ||
    node?.edge_felix_video_timeline?.edges ||
    [];
  return edges.slice(0, 12).map((edge) => {
    const n = edge?.node || {};
    const captionEdge = n.edge_media_to_caption?.edges?.[0]?.node;
    const ts = n.taken_at_timestamp;
    return {
      shortcode: n.shortcode || null,
      likes: n.edge_liked_by?.count ?? n.edge_media_preview_like?.count ?? 0,
      comments: n.edge_media_to_comment?.count ?? 0,
      caption: captionEdge?.text ?? null,
      postedAt: ts ? new Date(ts * 1000).toISOString() : null,
      mediaType: n.is_video
        ? 'video'
        : n.__typename === 'GraphSidecar'
        ? 'carousel'
        : 'image',
      mediaUrl: n.display_url || n.thumbnail_src || null,
      permalink: n.shortcode ? `https://www.instagram.com/p/${n.shortcode}/` : null,
    };
  });
}

function profileFromUserNode(user, fallback = {}) {
  return {
    platform: PLATFORM,
    username: user.username,
    fullName: user.full_name ?? null,
    bio: user.biography ?? null,
    profilePicUrl:
      user.profile_pic_url_hd || user.profile_pic_url || fallback.profilePicUrl || null,
    externalUrl: user.external_url ?? null,
    isVerified: Boolean(user.is_verified),
    followers: parseCount(user.edge_followed_by?.count),
    following: parseCount(user.edge_follow?.count),
    postsCount: parseCount(user.edge_owner_to_timeline_media?.count),
    posts: buildPostsFromGraph(user), // usually empty — feed/user fills these
  };
}

/**
 * Pull the latest 12 posts via /api/v1/feed/user/:id/ — the modern endpoint
 * the web client uses. `web_profile_info` returns counts but no edges, so
 * this is the only path that actually populates likes/comments/captions.
 *
 * Maps IG's `media_type` (1=image, 2=video, 8=carousel) to our schema's
 * string values. `play_count` lands on `views` for videos.
 */
async function fetchUserFeed(userId, username, count = 12) {
  const session = pickSession();
  let headers;
  try {
    headers = buildIgHeaders({ referer: PROFILE_URL(username), session });
  } catch {
    return []; // No session → can't hit feed/user (it requires auth).
  }

  const url = `https://www.instagram.com/api/v1/feed/user/${userId}/?count=${count}`;
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  } catch (err) {
    logger.warn({ username, err: err.message }, 'feed/user fetch threw');
    return [];
  }
  if (res.status === 429) markCold(session?.id);
  if (!res.ok) {
    logger.warn({ username, status: res.status, sessionId: session?.id }, 'feed/user non-OK');
    return [];
  }
  const json = await res.json().catch(() => null);
  const items = json?.items;
  if (!Array.isArray(items)) return [];

  return items.slice(0, count).map((it) => {
    const code = it.code || it.shortcode || null;
    const isVideo = it.media_type === 2 || !!it.video_versions;
    const isCarousel = it.media_type === 8 || Array.isArray(it.carousel_media);
    return {
      shortcode: code,
      likes: parseCount(it.like_count),
      comments: parseCount(it.comment_count),
      // play_count is videos only; carousel/image have no view notion.
      views: it.play_count != null
        ? parseCount(it.play_count)
        : it.view_count != null
        ? parseCount(it.view_count)
        : null,
      caption: it.caption?.text || null,
      postedAt: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : null,
      mediaType: isVideo ? 'video' : isCarousel ? 'carousel' : 'image',
      mediaUrl: it.image_versions2?.candidates?.[0]?.url || null,
      permalink: code ? `https://www.instagram.com/p/${code}/` : null,
    };
  });
}

/**
 * Strategy A — call Instagram's logged-out web JSON API directly.
 * Faster than Playwright (no browser cold-start) and gives exact integer
 * counts plus the latest 12 posts with likes/comments.
 *
 * Some IPs / regions get a 401/429 here; falls through to Playwright on
 * any non-success.
 */
async function fetchViaWebProfileInfo(username) {
  // Pool-aware: pick a session, retry once with a different session on 429.
  let session = pickSession();
  let res;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let headers;
    try {
      headers = buildIgHeaders({ referer: PROFILE_URL(username), session });
    } catch {
      // No session at all — fall back to anonymous (works for some profiles).
      headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'X-IG-App-ID': '936619743392459',
        'Accept': '*/*',
        'Referer': PROFILE_URL(username),
        'Origin': 'https://www.instagram.com',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
      };
    }

    res = await fetch(IG_API_URL(username), {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });

    if (res.status === 429 && attempt === 0) {
      markCold(session?.id);
      const next = pickSession();
      if (next && next.id !== session?.id) {
        logger.info(
          { username, from: session?.id, to: next.id },
          'web_profile_info: rotating to fresh session after 429'
        );
        session = next;
        continue; // retry with fresh session
      }
    }
    break;
  }

  if (res.status === 404) {
    const err = new Error(`Profile @${username} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`web_profile_info HTTP ${res.status}`);
    err.code = 'API_BLOCKED';
    throw err;
  }

  const json = await res.json();
  const user = json?.data?.user;
  if (!user || !user.username) {
    const err = new Error('web_profile_info returned no user node');
    err.code = 'API_EMPTY';
    throw err;
  }

  const profile = profileFromUserNode(user);

  // Posts moved out of web_profile_info — fetch them from feed/user. We
  // intentionally don't fail the whole scrape if this 2nd call errors;
  // profile data is still useful on its own.
  const userId = String(user.id || user.pk || '');
  if (userId && !profile.posts.length) {
    const feedPosts = await fetchUserFeed(userId, profile.username);
    if (feedPosts.length) profile.posts = feedPosts;
  }

  return profile;
}

/**
 * Strategy B — full Playwright load of the public profile page, walking
 * every embedded JSON blob and falling back to OG meta.
 */
async function fetchViaPlaywright(username) {
  const { browser, context, proxy } = await launchContext();
  const page = await context.newPage();

  try {
    if (proxy) logger.debug({ platform: PLATFORM, proxy: proxy.server }, 'using proxy');

    await page.goto(PROFILE_URL(username), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    if (/\/accounts\/login/i.test(page.url())) {
      const err = new Error('Login wall — Instagram blocked anonymous access');
      err.code = 'BLOCKED';
      throw err;
    }

    await page.waitForTimeout(1500);

    // Strategy A inside the browser: now that we have IG's cookies + a
    // real TLS fingerprint, the JSON API often succeeds where bare fetch
    // failed. This is the cheapest precision we can buy.
    try {
      const apiData = await page.evaluate(async (u) => {
        const r = await fetch(
          `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`,
          {
            headers: {
              'X-IG-App-ID': '936619743392459',
              'Accept': '*/*',
              'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'include',
          }
        );
        if (!r.ok) return { _error: `HTTP ${r.status}` };
        try { return await r.json(); } catch (e) { return { _error: 'non-json' }; }
      }, username);

      const userNode = apiData?.data?.user;
      if (userNode?.username) {
        logger.info(
          { platform: PLATFORM, username, source: 'browser_api' },
          'scraped via web_profile_info inside browser (precise)'
        );
        return profileFromUserNode(userNode);
      }
    } catch (e) {
      logger.debug({ err: e.message }, 'in-browser API call threw');
    }

    const [jsonBlobs, meta] = await Promise.all([
      extractJsonScripts(page),
      extractMeta(page),
    ]);

    let profile = null;
    for (const blob of jsonBlobs) {
      profile = findInJson(blob, looksLikeProfileNode);
      if (profile) break;
    }

    const fromText = parseCountsFromText(
      meta.ogDescription || meta.description || meta.title,
      {
        followers: 'Followers?',
        following: 'Following',
        postsCount: 'Posts?',
      }
    );

    if (/page not found/i.test(meta.title || '')) {
      const err = new Error(`Profile @${username} not found`);
      err.code = 'NOT_FOUND';
      throw err;
    }

    const result = profile
      ? profileFromUserNode(profile, { profilePicUrl: meta.ogImage })
      : {
          platform: PLATFORM,
          username,
          fullName: null,
          bio: null,
          profilePicUrl: meta.ogImage || null,
          externalUrl: null,
          isVerified: false,
          followers: parseCount(fromText.followers),
          following: parseCount(fromText.following),
          postsCount: parseCount(fromText.postsCount),
          posts: [],
        };

    if (!result.fullName && meta.title) {
      const m = meta.title.match(/^(.+?)\s+\(@/);
      if (m) result.fullName = m[1].trim();
    }

    if (!result.followers && !result.profilePicUrl) {
      const err = new Error(
        `Failed to extract data for @${username} — likely login wall or layout change`
      );
      err.code = 'EXTRACTION_FAILED';
      throw err;
    }

    return result;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function scrapeOnce(username) {
  // Try the JSON API first — exact integer counts + post engagement data.
  try {
    const result = await fetchViaWebProfileInfo(username);
    logger.info(
      {
        platform: PLATFORM,
        username,
        followers: result.followers,
        posts: result.posts.length,
        source: 'web_api',
      },
      'scraped via web_profile_info (precise)'
    );
    return result;
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw err;
    // Bump to info so we can see WHY we fell back without DEBUG noise.
    logger.info(
      { platform: PLATFORM, username, code: err.code, err: err.message },
      'web_profile_info blocked → falling back to Playwright (lower precision)'
    );
  }

  // Fall back to Playwright + fetch-inside-browser. The browser context has
  // a real TLS fingerprint + cookies so it survives some checks the bare
  // fetch above can't. We retry the JSON API from within page.evaluate
  // before giving up to OG meta parsing.
  return fetchViaPlaywright(username);
}

async function scrape(username) {
  const max = env.scraper.maxRetries;
  let lastError;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      logger.info({ platform: PLATFORM, username, attempt }, 'scraping');
      // Random jitter only between attempts (keep first attempt fast for the
      // JSON-API path which doesn't load a browser).
      if (attempt > 1) await randomDelay();
      return await scrapeOnce(username);
    } catch (err) {
      lastError = err;
      logger.warn(
        { platform: PLATFORM, username, attempt, err: err.message, code: err.code },
        'scrape attempt failed'
      );
      if (err.code === 'NOT_FOUND') throw err;
      if (attempt < max) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError || new Error('Unknown scrape failure');
}

function normalizePosts(posts) {
  return (posts || []).slice(0, 12).map((p) => ({
    shortcode: p.shortcode,
    likes: parseCount(p.likes),
    comments: parseCount(p.comments),
    // Preserve views (video play_count) — it's nullable for image/carousel.
    views: p.views != null ? parseCount(p.views) : null,
    caption: trimCaption(p.caption),
    postedAt: p.postedAt ? new Date(p.postedAt) : null,
    mediaType: p.mediaType,
    mediaUrl: p.mediaUrl,
    permalink: p.permalink,
  }));
}

module.exports = {
  platform: PLATFORM,
  profileUrl: PROFILE_URL,
  scrape,
  normalizePosts,
  scrapeInfluencer: scrape, // legacy export
};
