'use strict';

const logger = require('../utils/logger');
const prisma = require('../prisma/client');
const { buildIgHeaders } = require('./instagram.headers');
const { pickSession, markCold } = require('./ig.pool');

// Stories don't paginate — IG returns the whole 24h-active set in one call
// for the requested user_id. We snapshot it; expired story rows stay in
// our DB as a permanent record (IG itself wipes them server-side).
const STORIES_URL = 'https://www.instagram.com/api/v1/feed/reels_media/';
const parseCount = (n) => (typeof n === 'number' ? n : null);

const pickMedia = (item) => {
  if (item.media_type === 2 || Array.isArray(item.video_versions)) {
    const url = item.video_versions?.[0]?.url || null;
    const thumb = item.image_versions2?.candidates?.[0]?.url || null;
    return { mediaType: 'video', mediaUrl: url, thumbnailUrl: thumb };
  }
  const url = item.image_versions2?.candidates?.[0]?.url || null;
  return { mediaType: 'image', mediaUrl: url, thumbnailUrl: url };
};

const mapStory = (item) => {
  const id = item?.id || item?.pk ? String(item.id || item.pk) : null;
  if (!id) return null;
  const { mediaType, mediaUrl, thumbnailUrl } = pickMedia(item);
  return {
    storyId: id,
    mediaType,
    mediaUrl,
    thumbnailUrl,
    views: parseCount(item.view_count) ?? parseCount(item.reel_viewer_count),
    takenAt:   item.taken_at    ? new Date(item.taken_at * 1000)    : null,
    expiresAt: item.expiring_at ? new Date(item.expiring_at * 1000) : null,
  };
};

const upsertStories = async (influencerId, items) => {
  for (const s of items) {
    if (!s?.storyId) continue;
    await prisma.story.upsert({
      where: { storyId: s.storyId },
      create: { influencerId, ...s },
      update: {
        views: s.views,
        mediaUrl: s.mediaUrl,
        thumbnailUrl: s.thumbnailUrl,
        expiresAt: s.expiresAt,
      },
    }).catch((err) => logger.warn({ storyId: s.storyId, err: err.message }, 'story upsert failed'));
  }
};

const scrapeStories = async ({ influencerId, username, userId }) => {
  let session = pickSession();
  if (!session) {
    return { fetched: 0, blocked: true, blockedReason: 'No IG session' };
  }

  let headers;
  try {
    headers = buildIgHeaders({
      referer: `https://www.instagram.com/stories/${username}/`,
      session,
    });
  } catch (err) {
    return { fetched: 0, blocked: true, blockedReason: err.message };
  }

  const url = `${STORIES_URL}?reel_ids=${encodeURIComponent(userId)}`;
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    return { fetched: 0, blocked: true, blockedReason: `network: ${err.message}` };
  }

  if (res.status === 429) {
    markCold(session?.id);
    return { fetched: 0, blocked: true, blockedReason: 'HTTP 429' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { fetched: 0, blocked: true, blockedReason: `HTTP ${res.status}: ${text.slice(0, 80)}` };
  }

  const json = await res.json().catch(() => null);
  // Response shape: { reels: { "<userId>": { items: [...] } }, reels_media: [...] }
  const reel =
    json?.reels?.[userId] ||
    (Array.isArray(json?.reels_media) ? json.reels_media[0] : null);
  const items = Array.isArray(reel?.items) ? reel.items : [];

  if (!items.length) {
    return { fetched: 0, blocked: false };
  }

  const batch = items.map(mapStory).filter(Boolean);
  if (batch.length) await upsertStories(influencerId, batch);

  return { fetched: batch.length, blocked: false };
};

module.exports = { scrapeStories };
