'use strict';

// Wraps async route handlers so thrown / rejected errors hit Express' error
// pipeline instead of becoming unhandled rejections.
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
