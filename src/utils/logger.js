'use strict';

const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.logLevel,
  transport:
    env.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        }
      : undefined,
  base: { env: env.nodeEnv },
});

module.exports = logger;
