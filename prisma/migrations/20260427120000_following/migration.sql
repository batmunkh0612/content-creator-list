-- Influencer: add follower-tracking equivalents for the following list
ALTER TABLE "influencers" ADD COLUMN "followingFetched" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "influencers" ADD COLUMN "followingFetchedAt" TIMESTAMP(3);
ALTER TABLE "influencers" ADD COLUMN "followingBlocked" BOOLEAN NOT NULL DEFAULT false;

-- Following: per-influencer rows for accounts that influencer follows.
-- Same shape as `followers` so reads/persistence are symmetric.
CREATE TABLE "following" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT,
    "profilePicUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "following_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "following_influencerId_username_key" ON "following"("influencerId", "username");
CREATE INDEX "following_influencerId_idx" ON "following"("influencerId");

ALTER TABLE "following" ADD CONSTRAINT "following_influencerId_fkey"
  FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
