'use strict';

const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const isOperational = err instanceof ApiError;
  const statusCode = isOperational ? err.statusCode : 500;

  if (statusCode >= 500) {
    logger.error(
      { err: err.message, stack: err.stack, path: req.path, method: req.method },
      'unhandled error'
    );
  } else {
    logger.warn(
      { err: err.message, path: req.path, method: req.method, status: statusCode },
      'request error'
    );
  }

  const body = {
    error: {
      message: isOperational ? err.message : 'Internal server error',
      ...(isOperational && err.details ? { details: err.details } : {}),
    },
  };

  if (env.nodeEnv === 'development' && !isOperational) {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
