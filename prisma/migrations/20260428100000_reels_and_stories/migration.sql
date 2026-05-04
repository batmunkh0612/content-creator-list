-- Reels share the `posts` table (mediaType='reel') so all post-level
-- aggregates include them; the cursor here is for IG's clips/user endpoint.
ALTER TABLE "influencers" ADD COLUMN "reelsCursor"      TEXT;
ALTER TABLE "influencers" ADD COLUMN "reelsFetchedAt"   TIMESTAMP(3);

-- Stories are ephemeral on IG (24h) — we snapshot active set on demand.
ALTER TABLE "influencers" ADD COLUMN "storiesFetchedAt" TIMESTAMP(3);

CREATE INDEX "posts_mediaType_idx" ON "posts" ("mediaType");

CREATE TABLE "stories" (
    "id"           TEXT PRIMARY KEY,
    "influencerId" TEXT NOT NULL,
    "storyId"      TEXT NOT NULL UNIQUE,
    "mediaType"    TEXT,
    "mediaUrl"     TEXT,
    "thumbnailUrl" TEXT,
    "views"        INTEGER,
    "takenAt"      TIMESTAMP(3),
    "expiresAt"    TIMESTAMP(3),
    "scrapedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stories_influencerId_fkey" FOREIGN KEY ("influencerId")
        REFERENCES "influencers"("id") ON DELETE CASCADE
);
CREATE INDEX "stories_influencerId_idx" ON "stories" ("influencerId");
CREATE INDEX "stories_takenAt_idx"      ON "stories" ("takenAt");
