-- Persist IG's `next_max_id` cursor per influencer so each "fetch N more"
-- click resumes pagination instead of restarting from page 1.
ALTER TABLE "influencers" ADD COLUMN "followersCursor" TEXT;
ALTER TABLE "influencers" ADD COLUMN "followingCursor" TEXT;
