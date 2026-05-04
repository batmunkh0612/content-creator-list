'use strict';

const env = require('../config/env');

const IG_APP_ID = '936619743392459';

function readCookie(jar, name) {
  if (!jar) return null;
  const re = new RegExp(`(?:^|; )${name}=([^;]+)`);
  const m = jar.match(re);
  return m ? m[1] : null;
}

function buildCookieJar(session) {
  // Prefer the full DevTools-pasted jar (csrftoken, mid, datr, rur included).
  if (session?.cookies) return session.cookies;
  // Fallback: minimal jar from sessionid + ds_user_id. Works for some
  // endpoints (web_profile_info), often rejected on paginated endpoints.
  const sid = session?.sessionid || env.scraper.igSessionId;
  const ds  = session?.dsUserId  || env.scraper.igDsUserId;
  if (!sid) return null;
  const parts = [`sessionid=${sid}`];
  if (ds) parts.push(`ds_user_id=${ds}`);
  return parts.join('; ');
}

/**
 * Build the IG XHR headers used by every fetcher. Pass a `session` from
 * the pool; if omitted, falls back to legacy env (for callers not yet
 * wired to the pool).
 */
function buildIgHeaders({ referer = 'https://www.instagram.com/', session } = {}) {
  const cookieJar = buildCookieJar(session);
  if (!cookieJar) {
    const err = new Error(
      'No Instagram cookies/sessionid configured. Set IG_COOKIES (preferred) ' +
      'or IG_SESSIONID — see .env.example for multi-session pool setup.'
    );
    err.code = 'NO_SESSION';
    throw err;
  }

  const csrftoken = readCookie(cookieJar, 'csrftoken');
  const wwwClaim = session?.wwwClaim || env.scraper.igWwwClaim;

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Priority': 'u=1, i',
    'Referer': referer,
    'Origin': 'https://www.instagram.com',
    'Sec-Ch-Ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'X-Asbd-Id': '359341',
    'X-Ig-App-Id': IG_APP_ID,
    'X-Ig-Max-Touch-Points': '0',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': cookieJar,
  };

  if (csrftoken) headers['X-Csrftoken'] = csrftoken;
  if (wwwClaim)  headers['X-Ig-Www-Claim'] = wwwClaim;

  return headers;
}

/**
 * Headers used for IG's POST /graphql/query endpoint. Mirrors the request
 * shape Chrome 147 on macOS sends — IG's bot check 403s on missing
 * sec-ch-ua-* / x-bloks-version-id when the User-Agent claims Chrome 147.
 *
 * Caller supplies `tokens` (`fb_dtsg`, `lsd`, ...) + `friendlyName` /
 * `rootFieldName` for the specific GraphQL query being made. The Cookie
 * jar comes from the session and MUST contain `csrftoken` — that value
 * doubles as the `x-csrftoken` header.
 */
const BLOKS_VERSION_ID =
  'ad0f1f5e41c2d9fcde83dfd68eea4def768b66bc3029c58e846d7c1dda44ba2a';

function buildGraphqlHeaders({ session, referer, tokens, friendlyName, rootFieldName }) {
  const cookieJar = buildCookieJar(session);
  if (!cookieJar) {
    const err = new Error('No Instagram session configured.');
    err.code = 'NO_SESSION';
    throw err;
  }
  const csrftoken = readCookie(cookieJar, 'csrftoken');
  if (!csrftoken) {
    const err = new Error(
      'csrftoken cookie missing from session. The GraphQL endpoint requires the full Cookie jar (paste it into the IG Sessions UI).'
    );
    err.code = 'NO_CSRFTOKEN';
    throw err;
  }

  return {
    // Common
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'content-type': 'application/x-www-form-urlencoded',
    'origin': 'https://www.instagram.com',
    'referer': referer,
    'priority': 'u=1, i',

    // Chrome 147 / macOS client hints — match what the browser sends.
    'sec-ch-prefers-color-scheme': 'dark',
    'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    'sec-ch-ua-full-version-list':
      '"Google Chrome";v="147.0.7727.102", "Not.A/Brand";v="8.0.0.0", "Chromium";v="147.0.7727.102"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-platform': '"macOS"',
    'sec-ch-ua-platform-version': '"26.4.1"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',

    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',

    // IG/FB-specific
    'x-asbd-id': '359341',
    'x-bloks-version-id': BLOKS_VERSION_ID,
    'x-csrftoken': csrftoken,
    'x-fb-friendly-name': friendlyName,
    'x-fb-lsd': tokens.lsd,
    'x-ig-app-id': IG_APP_ID,
    'x-ig-max-touch-points': '0',
    'x-root-field-name': rootFieldName,

    'cookie': cookieJar,
  };
}

module.exports = { buildIgHeaders, buildGraphqlHeaders, IG_APP_ID };
