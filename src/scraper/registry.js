'use strict';

const instagram = require('./instagram.scraper');
const youtube = require('./youtube.scraper');
const tiktok = require('./tiktok.scraper');
const facebook = require('./facebook.scraper');

const SCRAPERS = { instagram, youtube, tiktok, facebook };
const PLATFORMS = Object.keys(SCRAPERS);
const DEFAULT_PLATFORM = 'instagram';

function getScraper(platform) {
  const s = SCRAPERS[platform];
  if (!s) {
    const err = new Error(`Unknown platform: ${platform}`);
    err.code = 'UNKNOWN_PLATFORM';
    throw err;
  }
  return s;
}

// Per-platform username sanitization. Strip leading '@' and platform-specific
// URL prefixes so users can paste either bare handles or full profile URLs.
function normalizeUsername(platform, raw) {
  let v = String(raw || '').trim();
  if (!v) return '';

  // Strip URL prefix if present so paste-friendly behaviour works.
  v = v.replace(/^https?:\/\/(?:www\.)?/i, '');
  v = v.replace(/^(instagram|youtube|tiktok|facebook|fb)\.com\//i, '');
  v = v.replace(/^m\.(instagram|tiktok|facebook)\.com\//i, '');

  // Drop common path prefixes.
  v = v.replace(/^@/, '');
  if (platform === 'youtube') {
    v = v.replace(/^\/?(@|c\/|user\/|channel\/)/i, (m) => (m.startsWith('channel/') ? 'channel/' : ''));
  }

  // Strip query string and trailing slash.
  v = v.split('?')[0].replace(/\/+$/, '');

  return v;
}

const VALIDATORS = {
  instagram: (u) => /^[A-Za-z0-9._]{1,30}$/.test(u),
  youtube: (u) => /^[A-Za-z0-9._\-]{1,80}$/.test(u) || /^channel\/UC[A-Za-z0-9_-]{20,30}$/.test(u),
  tiktok: (u) => /^[A-Za-z0-9._]{1,24}$/.test(u),
  facebook: (u) => /^[A-Za-z0-9.\-]{3,80}$/.test(u),
};

function isValidUsername(platform, username) {
  const v = VALIDATORS[platform];
  return v ? v(username) : false;
}

module.exports = {
  PLATFORMS,
  DEFAULT_PLATFORM,
  SCRAPERS,
  getScraper,
  normalizeUsername,
  isValidUsername,
};
