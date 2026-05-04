'use strict';

/**
 * Helpers shared by the per-platform scrapers. Kept platform-neutral so each
 * scraper can compose them with its own DOM logic.
 */

const { parseCount } = require('../utils/normalize');

/**
 * Walk a (possibly cyclic-but-finite-in-practice) JSON tree looking for the
 * first node where `predicate(node)` returns truthy. Returns that node.
 */
function findInJson(tree, predicate, maxDepth = 30) {
  const stack = [{ node: tree, depth: 0 }];
  const seen = new WeakSet();

  while (stack.length) {
    const { node, depth } = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (depth > maxDepth) continue;

    try {
      if (predicate(node)) return node;
    } catch {
      // ignore predicate exceptions (defensive walking)
    }

    for (const key of Object.keys(node)) {
      stack.push({ node: node[key], depth: depth + 1 });
    }
  }
  return null;
}

/** Pluck the contents of every <script type="application/json"> as parsed JSON. */
async function extractJsonScripts(page) {
  return page.evaluate(() => {
    const results = [];
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      try {
        results.push(JSON.parse(script.textContent || '{}'));
      } catch {
        // skip malformed
      }
    }
    return results;
  });
}

/** Pull data out of any inline `var X = {...};` script and return { name → object }. */
async function extractInlineGlobals(page, names) {
  return page.evaluate((wanted) => {
    const out = {};
    for (const script of document.querySelectorAll('script')) {
      const txt = script.textContent || '';
      for (const name of wanted) {
        if (out[name]) continue;
        const re = new RegExp(`(?:var|let|const|window\\.)\\s*${name}\\s*=\\s*({[\\s\\S]+?});`);
        const m = txt.match(re);
        if (m) {
          try { out[name] = JSON.parse(m[1]); } catch {}
        }
      }
    }
    return out;
  }, names);
}

/** Read OpenGraph + standard meta tags. */
async function extractMeta(page) {
  return page.evaluate(() => {
    const get = (sel) =>
      document.querySelector(sel)?.getAttribute('content') || null;
    return {
      ogTitle: get('meta[property="og:title"]'),
      ogDescription: get('meta[property="og:description"]'),
      ogImage: get('meta[property="og:image"]'),
      ogUrl: get('meta[property="og:url"]'),
      description: get('meta[name="description"]'),
      title: document.title || null,
    };
  });
}

/**
 * Parse "1,234 Followers, 5,678 Following, 90 Posts" style text and return
 * whatever subset of counts are present. Each label is matched independently
 * so missing fields just stay undefined.
 */
function parseCountsFromText(text, labels) {
  if (!text) return {};
  const out = {};
  for (const [key, pattern] of Object.entries(labels)) {
    const re = new RegExp(`([\\d.,]+\\s*[KMB]?)\\s*${pattern}`, 'i');
    const m = text.match(re);
    if (m) out[key] = parseCount(m[1]);
  }
  return out;
}

module.exports = {
  findInJson,
  extractJsonScripts,
  extractInlineGlobals,
  extractMeta,
  parseCountsFromText,
};
