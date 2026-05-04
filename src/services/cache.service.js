'use strict';

const { sharedClient } = require('../config/redis');
const env = require('../config/env');
const logger = require('../utils/logger');

const PREFIX = 'cache:';

async function get(key) {
  try {
    const raw = await sharedClient.get(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cache get failed');
    return null;
  }
}

async function set(key, value, ttlSeconds = env.cache.ttlSeconds) {
  try {
    await sharedClient.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cache set failed');
  }
}

async function del(key) {
  try {
    await sharedClient.del(PREFIX + key);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cache del failed');
  }
}

/**
 * Cache-aside helper. Calls loader() on miss, stores result, returns it.
 * Loader exceptions bubble up — we don't cache failures.
 */
async function wrap(key, loader, ttlSeconds) {
  const hit = await get(key);
  if (hit !== null) return hit;
  const fresh = await loader();
  if (fresh !== undefined && fresh !== null) {
    await set(key, fresh, ttlSeconds);
  }
  return fresh;
}

module.exports = { get, set, del, wrap };
