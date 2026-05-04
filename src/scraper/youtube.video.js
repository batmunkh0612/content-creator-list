'use strict';

const logger = require('../utils/logger');
const { parseCount } = require('../utils/normalize');

// Per-video enrichment — likes + comments aren't exposed on the channel
// grid, only on the watch page. We fetch the watch HTML and pull them out
// of `ytInitialData`. Cheap-ish (~200kb each), so we throttle to a small
// concurrency to stay polite.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
const COOKIE = 'CONSENT=YES+1.en+V13; SOCS=CAI';

const stripCountSuffix = (s) =>
  s ? String(s).replace(/\s+(likes?|comments?|views?|watching|streamed)$/i, '').trim() : s;

// `ytInitialData` lives inside an inline <script> on every watch page. The
// regex set is the same as the channel scraper — three flavours covering
// different YT bundles.
const extractYtInitialData = (html) => {
  const re1 = /var ytInitialData\s*=\s*({[\s\S]+?});\s*<\/script>/;
  const re2 = /ytInitialData"\]\s*=\s*({[\s\S]+?});/;
  const re3 = /ytInitialData\s*=\s*({[\s\S]+?});\s*window\["ytInitialPlayerResponse"\]/;
  const m = html.match(re1) || html.match(re2) || html.match(re3);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};

// Like count seam (probed live): the watch HTML inlines a flat
// `"likeCount":"104637"` field as part of the dynamic-update bootstrap.
// Newer bundles drop the integer; the accessibility label always carries
// the comma-separated count as a fallback.
const findLikeCount = (data, html) => {
  // Direct integer field — most reliable when present.
  const m1 = html.match(/"likeCount"\s*:\s*"(\d+)"/);
  if (m1) return Number(m1[1]);
  // Accessibility label: "like this video along with 104,637 other people"
  const m2 = html.match(/like this video along with\s+([\d,]+)\s+other/i);
  if (m2) return parseCount(m2[1]);
  // Older shape: defaultText.simpleText carries the rendered "1.2K" string.
  const m3 = JSON.stringify(data).match(/"defaultText"\s*:\s*\{\s*"simpleText"\s*:\s*"([\d,.]+\s*[KMB]?)"/);
  if (m3) return parseCount(m3[1]);
  return null;
};

// Comment count is NOT inlined on the watch page — YouTube loads it via a
// `/youtubei/v1/next` continuation after page-load. Skipping it for now
// keeps the enricher cheap; per-video comments are a future round.
const findCommentCount = () => null;

// Best-effort published timestamp. The watch page exposes a full ISO
// `publishDate` like "2026-04-24T13:41:58-07:00" — keeps the time-of-day
// info so the cadence chart's day-gap math stays accurate.
const findPostedAt = (data, html) => {
  const m = html.match(/"publishDate"\s*:\s*"([^"]+)"/) ||
            JSON.stringify(data).match(/"publishDate"\s*:\s*"([^"]+)"/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
};

const fetchVideoStats = async (videoId) => {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cookie': COOKIE,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { videoId, error: `fetch threw: ${err.message}` };
  }
  if (!res.ok) return { videoId, error: `HTTP ${res.status}` };

  const html = await res.text();
  const data = extractYtInitialData(html);
  if (!data) return { videoId, error: 'no ytInitialData' };

  return {
    videoId,
    likes: findLikeCount(data, html),
    comments: findCommentCount(data, html),
    postedAt: findPostedAt(data, html),
  };
};

// Run `fn(item)` for each item with at most `concurrency` in flight at once.
// Plain promise pool — keeps the scraper deterministic and avoids pulling a
// dep just for this. Resolves with results in input order.
const promisePool = async (items, concurrency, fn) => {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { out[i] = await fn(items[i], i); }
      catch (err) { out[i] = { error: err.message }; }
    }
  });
  await Promise.all(workers);
  return out;
};

/**
 * Enrich an array of video objects (output of mapVideoNode) with likes,
 * comments, and a real postedAt date. Mutates each item in-place when a
 * value is found; leaves it alone otherwise (so partial successes don't
 * regress good data we already had).
 */
const enrichWithStats = async (videos, { concurrency = 3 } = {}) => {
  const ids = videos.map((v) => v?.shortcode).filter(Boolean);
  if (!ids.length) return { enriched: 0, failed: 0 };
  const start = Date.now();
  const results = await promisePool(ids, concurrency, fetchVideoStats);

  let enriched = 0, failed = 0;
  for (let i = 0; i < videos.length; i += 1) {
    const v = videos[i];
    if (!v?.shortcode) continue;
    const r = results.find((rr) => rr?.videoId === v.shortcode);
    if (!r || r.error) { failed += 1; continue; }
    if (typeof r.likes === 'number')    v.likes    = r.likes;
    if (typeof r.comments === 'number') v.comments = r.comments;
    if (r.postedAt instanceof Date && !v.postedAt) v.postedAt = r.postedAt;
    enriched += 1;
  }
  logger.info(
    { count: ids.length, enriched, failed, elapsedMs: Date.now() - start },
    'YT stats enrichment done'
  );
  return { enriched, failed };
};

module.exports = { fetchVideoStats, enrichWithStats };
