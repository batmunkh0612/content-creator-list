'use strict';

const Joi = require('joi');
const ApiError = require('./ApiError');
const { PLATFORMS, DEFAULT_PLATFORM } = require('../scraper/registry');

const platformField = Joi.string().valid(...PLATFORMS).default(DEFAULT_PLATFORM);

const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(72).required(),
    name: Joi.string().min(1).max(80).optional(),
  }),
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).max(72).required().invalid(Joi.ref('currentPassword'))
      .messages({
        'any.invalid': 'newPassword must differ from currentPassword',
      }),
  }),
  influencerQuery: Joi.object({
    platform: Joi.string().valid(...PLATFORMS).optional(),
    minFollowers: Joi.number().integer().min(0).optional(),
    maxFollowers: Joi.number().integer().min(0).optional(),
    engagementRate: Joi.number().min(0).max(1).optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    sortBy: Joi.string()
      .valid('followers', 'engagementRate', 'createdAt')
      .default('followers'),
    sortDir: Joi.string().valid('asc', 'desc').default('desc'),
  }),
  bulkScrape: Joi.object({
    platform: platformField,
    usernames: Joi.array()
      .items(Joi.string().min(1).max(120))
      .max(500)
      .optional(),
    items: Joi.array()
      .items(
        Joi.object({
          platform: platformField,
          username: Joi.string().min(1).max(120).required(),
        })
      )
      .max(500)
      .optional(),
  }).or('usernames', 'items'),
  refreshAll: Joi.object({
    platform: Joi.string().valid(...PLATFORMS).optional(),
    // Skip rows scraped within the last N hours. 0 means "include everyone".
    olderThanHours: Joi.number().integer().min(0).max(24 * 30).default(0),
    // Hard cap so a runaway click can't enqueue 100k jobs.
    limit: Joi.number().integer().min(1).max(2000).default(1000),
  }),
};

const validate = (schema, source) => (req, _res, next) => {
  const { value, error } = schemas[schema].validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return next(
      new ApiError(400, 'Validation failed', error.details.map((d) => d.message))
    );
  }
  req[source] = value;
  next();
};

// Resolve platform (path segment) and run a basic shape check. The deeper
// per-platform username validation happens in the scrape controller via the
// registry — that's where the platform-specific regex lives.
const validatePlatform = (req, _res, next) => {
  if (!req.params.platform) return next();
  if (!PLATFORMS.includes(req.params.platform)) {
    return next(new ApiError(400, `Unknown platform: ${req.params.platform}`));
  }
  next();
};

module.exports = { validate, validatePlatform, PLATFORMS, DEFAULT_PLATFORM };
