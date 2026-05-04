---
title: Content Creator Worker
emoji: 🤖
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# Influencer Analytics Platform

A production-ready MVP for collecting and analyzing public Instagram influencer
data — like a stripped-down NoxInfluencer.

**Stack:** Node.js · Express · Playwright · PostgreSQL · Redis · BullMQ · Prisma · JWT · React · Vite · Tailwind · nginx

---

## Project structure

```
.
├── docker-compose.yml          # postgres + redis + api + worker + web
├── Dockerfile                  # Playwright base image, used by api & worker
├── frontend/                   # React + Vite + Tailwind SPA, served via nginx
├── prisma/
│   ├── schema.prisma
│   └── migrations/             # initial SQL migration
└── src/
    ├── server.js               # API entrypoint
    ├── app.js                  # Express app composition
    ├── config/                 # env + redis connections
    ├── controllers/            # HTTP handlers (thin)
    ├── services/               # business logic (auth, influencer, cache)
    ├── scraper/                # Playwright scraper + proxy rotation
    ├── queue/                  # BullMQ queue
    ├── workers/                # BullMQ worker process
    ├── middleware/             # auth, error, rate limit, 404
    ├── routes/                 # express routers
    ├── utils/                  # logger, normalize, metrics, validators
    └── prisma/client.js        # singleton Prisma client
```

---

## Quick start (Docker — zero to running)

```bash
# 1) Configure env
cp .env.example .env
# edit JWT_SECRET to a long random string

# 2) Build & launch everything
docker compose up --build

# Services:
#   Web (UI) → http://localhost:8080   ← open this in your browser
#   API      → http://localhost:3000
#   Postgres → localhost:5432
#   Redis    → localhost:6379
```

The web container is an nginx that serves the built React SPA and reverse-
proxies `/api/*` to the API service, so the browser only sees one origin
(`localhost:8080`) — no CORS to configure.

The `api` container runs `prisma migrate deploy` on start, so the schema
self-applies on the first boot. The `worker` container runs the BullMQ
processor in parallel.

Tail logs with:

```bash
docker compose logs -f api worker
```

---

## Quick start (local Node, without Docker)

```bash
# Backend
npm install
npx playwright install chromium
docker compose up -d postgres redis     # just the deps
cp .env.example .env                    # set DATABASE_URL=postgresql://app:app@localhost:5432/...
npx prisma migrate deploy
npm run dev          # API on :3000
npm run dev:worker   # in a second terminal

# Frontend (3rd terminal)
cd frontend
npm install
npm run dev          # SPA on http://localhost:5173 (Vite proxies /api → :3000)
```

---

## API

All endpoints (except `/health`, `/auth/register`, `/auth/login`) require
`Authorization: Bearer <token>`.

### Auth

| Method | Path             | Body                                |
| ------ | ---------------- | ----------------------------------- |
| POST   | `/auth/register` | `{ email, password, name? }`        |
| POST   | `/auth/login`    | `{ email, password }` → `{ token }` |
| GET    | `/auth/me`       | —                                   |

### Influencer

| Method | Path                                                              | Notes                              |
| ------ | ----------------------------------------------------------------- | ---------------------------------- |
| GET    | `/influencer/:username`                                           | Returns influencer + latest 12 posts. 404 until scraped. |
| GET    | `/influencers?minFollowers=&maxFollowers=&engagementRate=&limit=&offset=&sortBy=&sortDir=` | Filtered list. Sort by `followers \| engagementRate \| createdAt`. |

### Scraping

| Method | Path                | Notes                                                   |
| ------ | ------------------- | ------------------------------------------------------- |
| POST   | `/scrape/:username` | Enqueues a scrape job. Returns `{ jobId, statusUrl }`.  |
| GET    | `/scrape/jobs/:id`  | Job status (`pending \| active \| completed \| failed`).|

### Dashboard

| Method | Path                  | Notes                                       |
| ------ | --------------------- | ------------------------------------------- |
| GET    | `/dashboard/summary`  | Totals, queue health, top-10 by followers, top-10 by engagement, recently scraped. Cached 60s. |

### Health

| Method | Path      |
| ------ | --------- |
| GET    | `/health` |

---

## End-to-end example

```bash
# Register & save token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"hunter22hunter22","name":"Me"}' \
  | jq -r .token)

# Enqueue a scrape
curl -X POST http://localhost:3000/scrape/natgeo \
  -H "Authorization: Bearer $TOKEN"

# Poll job status (replace with the jobId returned above)
curl http://localhost:3000/scrape/jobs/<jobId> -H "Authorization: Bearer $TOKEN"

# Read scraped data
curl http://localhost:3000/influencer/natgeo -H "Authorization: Bearer $TOKEN"

# Filtered list
curl "http://localhost:3000/influencers?minFollowers=100000&engagementRate=0.01" \
  -H "Authorization: Bearer $TOKEN"

# Dashboard
curl http://localhost:3000/dashboard/summary -H "Authorization: Bearer $TOKEN"
```

---

## How the scraper works

`src/scraper/instagram.scraper.js` drives a headless Chromium via Playwright:

1. Picks the next proxy from `PROXY_LIST` (round-robin, optional).
2. Spawns a fresh isolated browser context with a randomized desktop user-agent
   and `navigator.webdriver` masked.
3. Waits 2–5s of randomized jitter (anti-bot heuristic).
4. Loads `https://www.instagram.com/<username>/`.
5. Walks every embedded `<script type="application/json">` looking for the
   profile node (`username`, `edge_followed_by`, `edge_follow`).
6. Falls back to parsing the OG description meta tag (`"123K Followers, 456
   Following, 789 Posts"`) so we get *something* even if Instagram tweaks
   the embedded JSON shape.
7. Normalizes counts (`"1.2K"` → `1200`), trims captions, returns the latest
   12 posts.
8. Retries up to 3 times with exponential backoff. `NOT_FOUND` errors aren't
   retried.

**Important:** Instagram aggressively blocks scrapers. For real production
use you'll want residential proxies in `PROXY_LIST`, and possibly an
authenticated session cookie. The MVP code path handles login walls
gracefully (returns an `EXTRACTION_FAILED` error rather than garbage data).

---

## Data model & metrics

Engagement rate and posting frequency are computed at persist time and stored
on the `Influencer` row, so list/filter queries never have to recompute:

- **engagementRate** = `(avgLikes + avgComments) / followers`, stored as a fraction.
- **postingFrequency** = posts per week, derived from the timestamp spread of
  the latest 12 posts.

See `src/utils/metrics.js`.

---

## Operations

- **Queue retries:** 3 attempts, exponential backoff starting at 5s. Failed
  jobs retained 7 days.
- **Rate limits:** 100 req/min per IP globally; 10 req/min for `/scrape/*`.
  Backed by Redis so it works across multiple API replicas.
- **Caching:** Influencer details and dashboard summary are cached
  cache-aside in Redis. TTL via `CACHE_TTL_SECONDS` (default 300s; dashboard
  is fixed at 60s).
- **Logs:** structured JSON via `pino`, prettified in development.
- **Graceful shutdown:** SIGTERM closes HTTP, drains workers, disconnects
  Prisma.

---

## Environment variables

See [`.env.example`](.env.example). Key ones:

| Variable               | Default          | Notes                                  |
| ---------------------- | ---------------- | -------------------------------------- |
| `JWT_SECRET`           | (required)       | Use a long random string in prod.      |
| `WORKER_CONCURRENCY`   | `2`              | Parallel scrapes per worker process.   |
| `SCRAPER_HEADLESS`     | `true`           | Set `false` to debug locally.          |
| `PROXY_LIST`           | empty            | Comma-separated `http://user:pass@host:port` list. |
| `RATE_LIMIT_MAX`       | `100`            | Global API requests per window.        |
| `CACHE_TTL_SECONDS`    | `300`            | Influencer cache TTL.                  |

---

## Stopping & cleaning up

```bash
docker compose down          # stop containers
docker compose down -v       # also drop the postgres + redis volumes
```
