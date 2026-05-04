# Playwright base image ships with Chromium + system deps preinstalled.
# IMPORTANT: this version MUST match the `playwright` pin in package.json,
# otherwise the npm lib looks for browser binaries the image doesn't have.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install dependencies first to leverage Docker layer caching.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Fail the build if the installed `playwright` lib doesn't match the base
# image, instead of waiting until a worker tries to launch Chromium.
RUN node -e "const v=require('playwright/package.json').version; \
  const want='1.59.1'; \
  if (v !== want) { \
    console.error('FATAL: playwright '+v+' installed but image is '+want); \
    process.exit(1); \
  }"

# Copy Prisma schema before generate so it's available at build time.
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 7860

# Default command runs the BullMQ scrape worker — this image is the one
# Hugging Face Spaces builds and runs. The API service in docker-compose
# overrides this CMD with `node src/server.js`, so local dev is unchanged.
# (Render deploys the API via its native Node runtime and ignores this file.)
CMD ["node", "src/workers/scrape.worker.js"]
