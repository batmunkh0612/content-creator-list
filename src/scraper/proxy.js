'use strict';

const env = require('../config/env');

let cursor = 0;

/**
 * Round-robin proxy picker. Returns an object Playwright accepts as
 * launchOptions.proxy, or null when no proxies are configured.
 *
 * Proxy format expected: http(s)://[user:pass@]host:port
 */
function nextProxy() {
  const list = env.scraper.proxyList;
  if (!list.length) return null;

  const raw = list[cursor % list.length];
  cursor += 1;

  try {
    const url = new URL(raw);
    const proxy = { server: `${url.protocol}//${url.host}` };
    if (url.username) proxy.username = decodeURIComponent(url.username);
    if (url.password) proxy.password = decodeURIComponent(url.password);
    return proxy;
  } catch {
    // Invalid entry — skip rather than crash the worker.
    return null;
  }
}

module.exports = { nextProxy };
