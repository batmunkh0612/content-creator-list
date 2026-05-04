"use client";

import { Avatar } from "@/components/v2/avatar";
import { VerifiedTick } from "@/components/v2/verified-tick";
import { PlatformPill, StatusBadge } from "@/components/v2/badges";
import { Icon } from "@/components/v2/icon";
import { AnimatedCounter } from "@/components/v2/animated-counter";
import { compactNum } from "@/lib/format";
import type { V2Influencer } from "@/lib/adapter";
import { StatTile } from "./stat-tile";
import { RecomputeButton } from "./recompute-button";
import { TERMINAL, type DetailJob } from "./use-detail";

const profileUrl = (platform: string, username: string) => {
	if (platform === "instagram") return `https://www.instagram.com/${username}/`;
	if (platform === "youtube")   return `https://www.youtube.com/@${username}`;
	if (platform === "tiktok")    return `https://www.tiktok.com/@${username}`;
	return `https://www.facebook.com/${username}/`;
};

type Props = {
	inf: V2Influencer;
	job: DetailJob | null;
	jobError: unknown;
	onScrape: () => void;
	onExport: () => void;
	onReload: () => void;
};

export const DetailHero = ({ inf, job, jobError, onScrape, onExport, onReload }: Props) => {
	const isRunning = !!job && !TERMINAL.has(job.status);
	const errMsg = jobError instanceof Error ? jobError.message : jobError ? String(jobError) : null;

	return (
		<div className="detail-hero fade-up">
			<div className="detail-hero-grid">
				<Avatar inf={inf} size="xl" />
				<div>
					<div className="tags-row" style={{ marginBottom: 8 }}>
						<PlatformPill platform={inf.platform} />
						<StatusBadge status={inf.status} />
						<span className="badge stable">trending {inf.trendingScore}/100</span>
						{job && (
							<span className={`badge ${job.status === "completed" ? "rising" : job.status === "failed" ? "dropping" : "neon"}`}>
								{String(job.status || "queued").toUpperCase()}
							</span>
						)}
					</div>
					<div className="detail-name">
						@{inf.username}
						{inf.isVerified && <VerifiedTick size={20} />}
					</div>
					<div className="detail-fullname">{inf.fullName || "—"}</div>
					{inf.bio && <div className="detail-bio">{inf.bio}</div>}
					{errMsg && (
						<div style={{
							marginTop: 10, padding: "6px 10px",
							background: "rgba(255,84,112,0.10)",
							border: "1px solid rgba(255,84,112,0.30)",
							borderRadius: 8, color: "#ff8aa0",
							fontFamily: "var(--mono)", fontSize: 11, maxWidth: 480,
						}}>
							{errMsg}
						</div>
					)}
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
					<button className="btn btn-primary" onClick={onScrape} disabled={isRunning} title="Re-scrape this profile right now">
						<Icon name="radar" size={13} />
						{isRunning ? "SCRAPING…" : "Re-scrape"}
					</button>
					<a className="btn btn-ghost btn-sm" href={profileUrl(inf.platform, inf.username)} target="_blank" rel="noreferrer">
						<Icon name="out" size={12} /> Open profile
					</a>
					<button className="btn btn-ghost btn-sm" onClick={onExport} title="Download the raw JSON for this profile">
						<Icon name="download" size={12} /> Export JSON
					</button>
					<RecomputeButton
						platform={inf.platform}
						username={inf.username}
						onDone={onReload}
					/>
				</div>
			</div>

			<div className="stat-strip">
				<StatTile label="Followers"    value={<AnimatedCounter value={inf.followers} />} exact={inf.followers} delta={inf.growthDay} glow />
				<StatTile
					label="Engagement"
					value={`${inf.engagementRate.toFixed(2)}%`}
					hint="(avg likes + avg comments) / followers — sampled over the latest 30 stored posts. Recomputes after every FETCH 10 NEW POSTS."
				/>
				<StatTile
					label="Avg views"
					value={<AnimatedCounter value={inf.avgViews} />}
					exact={inf.avgViews}
					hint="Mean of `views` across video posts in the sample. Posts with no view count are excluded — so 0 means: (a) photo-only profile (no videos), (b) IG hid play counts on those videos, or (c) old posts haven't been re-fetched yet (FETCH 10 NEW POSTS upserts fresh play_count)."
				/>
				<StatTile
					label="Posts/week"
					value={inf.postFrequency.toFixed(1)}
					hint="Sample size / time-span between oldest and newest sampled post (in weeks)."
				/>
				<StatTile label="Trending"     value={`${inf.trendingScore} / 100`} delta={inf.growthDay} hint="Composite: 4×engagement% + 25×recency-of-last-scrape + 35×log10(followers)/9. Frontend-only estimate." />
				<StatTile label="Avg likes"    value={compactNum(inf.avgLikes)}    exact={inf.avgLikes}    hint="Sum of likes across sample / sample size." />
				<StatTile label="Avg comments" value={compactNum(inf.avgComments)} exact={inf.avgComments} hint="Sum of comments across sample / sample size." />
				<StatTile label="Following"    value={compactNum(inf.following)}   exact={inf.following} />
			</div>
		</div>
	);
};
