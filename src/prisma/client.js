'use strict';

const { PrismaClient } = require('@prisma/client');
const env = require('../config/env');

// Reuse a single PrismaClient instance across the process. Reinstantiating
// drops connection pool warmup and leaks DB connections in dev/HMR.
const prisma = new PrismaClient({
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
