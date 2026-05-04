#!/usr/bin/env node
'use strict';

/**
 * Bulk-enqueue Instagram scrapes from a file of handles.
 *
 * Usage:
 *   EMAIL=me@example.com PASSWORD=hunter22hunter22 node scripts/bulk-scrape.js demo.json
 *
 * Optional env:
 *   API_URL    base URL (default http://localhost:3000)
 *   POLL       set to 1 to poll job status until done
 *
 * The input file may be either:
 *   - JSON array: ["@alice", "bob", ...]
 *   - Plain text: one handle per line, '@' optional
 */

const fs = require('node:fs');
const path = require('node:path');

const API = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const POLL = process.env.POLL === '1';
const file = process.argv[2] || 'demo.json';

function die(msg, code = 1) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function loadHandles(filePath) {
  const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
  const trimmed = raw.trim();

  // Try JSON array first.
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through to line parsing
    }
  }

  // Otherwise treat as one-per-line.
  return trimmed.split(/\r?\n/);
}

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`login failed: ${data.error?.message || res.status}`);
  return data.token;
}

async function bulkEnqueue(token, usernames) {
  const res = await fetch(`${API}/scrape/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ usernames }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`bulk enqueue failed: ${data.error?.message || res.status}`);
  return data;
}

async function pollJobs(token, jobs) {
  const counts = { pending: 0, active: 0, completed: 0, failed: 0, missing: 0 };
  let remaining = jobs.length;

  while (remaining > 0) {
    counts.pending = counts.active = counts.completed = counts.failed = counts.missing = 0;
    const results = await Promise.all(
      jobs.map(async ({ jobId }) => {
        const res = await fetch(`${API}/scrape/jobs/${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { status: 'missing' };
        return res.json();
      })
    );
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
    remaining = (counts.pending || 0) + (counts.active || 0);

    process.stdout.write(
      `\r  pending=${counts.pending}  active=${counts.active}  ` +
      `completed=${counts.completed}  failed=${counts.failed}     `
    );

    if (remaining > 0) await new Promise((r) => setTimeout(r, 5000));
  }
  process.stdout.write('\n');
  return counts;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    die('set EMAIL and PASSWORD env vars (existing user credentials)');
  }
  if (!fs.existsSync(file)) die(`file not found: ${file}`);

  const handles = loadHandles(file);
  console.log(`→ Loaded ${handles.length} entries from ${file}`);

  console.log(`→ Logging in to ${API} as ${EMAIL}…`);
  const token = await login();

  console.log(`→ POST ${API}/scrape/bulk`);
  const result = await bulkEnqueue(token, handles);

  console.log(`✓ Enqueued: ${result.enqueued}`);
  if (result.skipped?.length) {
    console.log(`  Skipped (${result.skipped.length}):`);
    for (const s of result.skipped) {
      console.log(`    - ${s.username}  (${s.reason})`);
    }
  }

  if (POLL) {
    console.log('→ Polling job statuses (Ctrl-C to stop watching)…');
    const counts = await pollJobs(token, result.jobs);
    console.log('Done:', counts);
  } else {
    console.log('→ Watch progress at http://localhost:8080  or via dashboard API.');
  }
}

main().catch((err) => die(err.stack || err.message));
