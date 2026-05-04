'use strict';

/**
 * Convert Instagram-style abbreviated counts ("1.2K", "3.4M") into integers.
 * Returns 0 for nullish / unparseable input rather than NaN, since these are
 * stored in NOT NULL columns.
 */
function parseCount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Math.max(0, Math.floor(value));

  const str = String(value).trim().toLowerCase().replace(/,/g, '');
  if (str === '') return 0;

  const match = str.match(/^([\d.]+)\s*([kmb])?$/);
  if (!match) {
    const direct = Number(str);
    return Number.isFinite(direct) ? Math.max(0, Math.floor(direct)) : 0;
  }

  const [, num, suffix] = match;
  const base = Number(num);
  if (!Number.isFinite(base)) return 0;

  const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[suffix] ?? 1;
  return Math.floor(base * multiplier);
}

/** Cap caption length so we don't blow up the DB row size. */
function trimCaption(caption, maxLen = 2200) {
  if (!caption) return null;
  const str = String(caption);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

module.exports = { parseCount, trimCaption };
