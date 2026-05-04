'use strict';

const { chromium } = require('playwright');
const env = require('../config/env');
const { nextProxy } = require('./proxy');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
];

const pickUserAgent = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

/**
 * Launch a fresh browser + isolated context for a single scrape.
 * We deliberately don't reuse the browser across jobs: a fresh context
 * keeps cookies/fingerprints isolated, which is what we want when rotating
 * proxies and pretending to be different visitors.
 */
async function launchContext() {
  const proxy = nextProxy();

  const browser = await chromium.launch({
    headless: env.scraper.headless,
    proxy: proxy || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    userAgent: pickUserAgent(),
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'UTC',
  });

  // Strip the navigator.webdriver flag — the most common bot tell.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // If the user pasted an IG session cookie, inject it. Instagram returns
  // precise follower counts and full post data to authenticated callers
  // and rounded ones to anonymous callers.
  if (env.scraper.igSessionId) {
    const cookies = [
      {
        name: 'sessionid',
        value: env.scraper.igSessionId,
        domain: '.instagram.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ];
    if (env.scraper.igDsUserId) {
      cookies.push({
        name: 'ds_user_id',
        value: env.scraper.igDsUserId,
        domain: '.instagram.com',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax',
      });
    }
    await context.addCookies(cookies);
  }

  return { browser, context, proxy };
}

const randomDelay = () => {
  const { minDelayMs, maxDelayMs } = env.scraper;
  const ms = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

module.exports = { launchContext, randomDelay };
