'use strict';

const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const prisma = require('./prisma/client');

const server = app.listen(env.port, () => {
  logger.info(
    { port: env.port, env: env.nodeEnv },
    'API server listening'
  );
});

const shutdown = async (signal) => {
  logger.info({ signal }, 'API shutting down');
  server.close(async () => {
    try {
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      logger.error({ err: err.message }, 'shutdown error');
      process.exit(1);
    }
  });

  // If close hangs (long-lived connections), bail after 10s.
  setTimeout(() => {
    logger.warn('forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'uncaught exception');
  process.exit(1);
});
