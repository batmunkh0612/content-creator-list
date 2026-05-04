-- Influencer: add platformUserId + follower-tracking columns
ALTER TABLE "influencers" ADD COLUMN "platformUserId" TEXT;
ALTER TABLE "influencers" ADD COLUMN "followersFetched" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "influencers" ADD COLUMN "followersFetchedAt" TIMESTAMP(3);
ALTER TABLE "influencers" ADD COLUMN "followersBlocked" BOOLEAN NOT NULL DEFAULT false;

-- Follower: per-influencer follower rows, deduped on (influencerId, username)
CREATE TABLE "followers" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT,
    "profilePicUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "followers_influencerId_username_key" ON "followers"("influencerId", "username");
CREATE INDEX "followers_influencerId_idx" ON "followers"("influencerId");

ALTER TABLE "followers" ADD CONSTRAINT "followers_influencerId_fkey"
  FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
