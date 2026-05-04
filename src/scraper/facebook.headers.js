'use strict';

const env = require('../config/env');

const readCookie = (jar, name) => {
  if (!jar) return null;
  const re = new RegExp(`(?:^|; )${name}=([^;]+)`);
  const m = jar.match(re);
  return m ? m[1] : null;
};

const buildCookieJar = (session) => {
  // Caller-supplied session takes precedence (future: per-user FB sessions).
  if (session?.cookies) return session.cookies;
  return env.scraper.fbCookies || null;
};

/**
 * Headers that mimic Chrome 147/macOS hitting www.facebook.com. FB blocks
 * any request that's missing the sec-ch-ua family or has an inconsistent
 * UA — match the IG header set; the only platform-specific bit is the
 * cookie jar.
 *
 * Two flavors:
 *   - HTML doc fetch (sec-fetch-dest=document)
 *   - XHR / GraphQL fetch (sec-fetch-dest=empty)
 */
const COMMON_CLIENT_HINTS = {
  'sec-ch-prefers-color-scheme': 'dark',
  'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  'sec-ch-ua-full-version-list':
    '"Google Chrome";v="147.0.7727.102", "Not.A/Brand";v="8.0.0.0", "Chromium";v="147.0.7727.102"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-model': '""',
  'sec-ch-ua-platform': '"macOS"',
  'sec-ch-ua-platform-version': '"26.4.1"',
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const buildFbHtmlHeaders = ({ session, referer = 'https://www.google.com/' }) => {
  const cookieJar = buildCookieJar(session);
  const headers = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'priority': 'u=0, i',
    'referer': referer,
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': referer.includes('facebook.com') ? 'same-origin' : 'cross-site',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': UA,
    ...COMMON_CLIENT_HINTS,
  };
  if (cookieJar) headers['cookie'] = cookieJar;
  return headers;
};

const buildFbGraphqlHeaders = ({ session, referer, tokens, friendlyName, rootFieldName }) => {
  const cookieJar = buildCookieJar(session);
  if (!cookieJar) {
    const err = new Error('No Facebook session configured (set FB_COOKIES env or pass a session).');
    err.code = 'NO_FB_SESSION';
    throw err;
  }
  const csrftoken = readCookie(cookieJar, 'csrftoken');

  const headers = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'content-type': 'application/x-www-form-urlencoded',
    'origin': 'https://www.facebook.com',
    'referer': referer,
    'priority': 'u=1, i',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': UA,
    'x-fb-friendly-name': friendlyName,
    'x-fb-lsd': tokens.lsd,
    'cookie': cookieJar,
    ...COMMON_CLIENT_HINTS,
  };
  if (csrftoken)     headers['x-csrftoken'] = csrftoken;
  if (rootFieldName) headers['x-root-field-name'] = rootFieldName;
  return headers;
};

module.exports = { buildFbHtmlHeaders, buildFbGraphqlHeaders, readCookie };
