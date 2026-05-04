-- Influencer: add platform + restructure unique key + extra metric columns
ALTER TABLE "influencers" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'instagram';
ALTER TABLE "influencers" ADD COLUMN "externalUrl" TEXT;
ALTER TABLE "influencers" ADD COLUMN "avgViews" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "influencers" ADD COLUMN "totalLikes" BIGINT;

DROP INDEX IF EXISTS "influencers_username_key";
CREATE UNIQUE INDEX "influencers_platform_username_key" ON "influencers"("platform", "username");
CREATE INDEX "influencers_platform_idx" ON "influencers"("platform");

-- Post: add views, shares, permalink
ALTER TABLE "posts" ADD COLUMN "views" INTEGER;
ALTER TABLE "posts" ADD COLUMN "shares" INTEGER;
ALTER TABLE "posts" ADD COLUMN "permalink" TEXT;

-- ScrapeJob: add platform
ALTER TABLE "scrape_jobs" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'instagram';
CREATE INDEX "scrape_jobs_platform_idx" ON "scrape_jobs"("platform");
