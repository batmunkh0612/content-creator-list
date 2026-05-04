'use strict';

const IORedis = require('ioredis');
const env = require('./env');

// REDIS_URL takes precedence — Upstash and other managed providers issue a
// `rediss://` URL that bundles host, port, password, and TLS in one string.
// Falls back to discrete REDIS_HOST/PORT/PASSWORD for the docker-compose
// dev setup where TLS isn't used.
const url = process.env.REDIS_URL;

const discreteOptions = {
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
};

// BullMQ requires `maxRetriesPerRequest: null` on the connection it owns.
const buildConnection = (overrides = {}) => {
  const options = { maxRetriesPerRequest: null, enableReadyCheck: false, ...overrides };
  return url ? new IORedis(url, options) : new IORedis({ ...discreteOptions, ...options });
};

// Shared client for cache + rate limit (separate from BullMQ's connection).
const sharedClient = url
  ? new IORedis(url, { lazyConnect: false })
  : new IORedis({ ...discreteOptions, lazyConnect: false });

module.exports = { buildConnection, sharedClient };
