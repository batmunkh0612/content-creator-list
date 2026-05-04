-- Persist IG feed/user `next_max_id` per influencer so each "fetch N more
-- posts" click walks deeper into the user's media history instead of
-- restarting from the latest page.
ALTER TABLE "influencers" ADD COLUMN "postsCursor" TEXT;
ALTER TABLE "influencers" ADD COLUMN "postsFetchedAt" TIMESTAMP(3);
