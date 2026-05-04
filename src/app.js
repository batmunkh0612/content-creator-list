'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit.middleware');
const errorHandler = require('./middleware/error.middleware');
const notFound = require('./middleware/notFound.middleware');
const logger = require('./utils/logger');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // honor X-Forwarded-For when behind a proxy/LB

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Pipe HTTP access logs through pino so format stays consistent.
app.use(
  morgan('tiny', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  })
);

app.use(apiLimiter);
app.use('/', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
