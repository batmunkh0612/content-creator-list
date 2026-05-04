"use client";

import { useMemo } from "react";
import { BarChart } from "@/components/v2/bar-chart";
import { compactNum, fmtPercent, fmtRelDate } from "@/lib/format";
import type { V2Influencer } from "@/lib/adapter";
import type { Post } from "./post-card";

type Props = { inf: V2Influencer; posts: Post[] };

// Real data only. Sample = latest N stored posts ordered by `postedAt DESC`.
const SAMPLE_SIZE = 30;

const labelForPost = (p: Post, idx: number, total: number): string => {
	const age = p.postedAt ? fmtRelDate(p.postedAt) : null;
	const pos = `post ${idx + 1}/${total}`;
	const type = (p.mediaType || "post").toUpperCase();
	return age ? `${pos} · ${type} · ${age}` : `${pos} · ${type}`;
};

const buildSeries = (inf: V2Influencer, posts: Post[]) => {
	// Most recent first → reverse so the chart reads left-to-right as oldest → newest.
	const slice = posts.slice(0, SAMPLE_SIZE).reverse();
	const labels = slice.map((p, i) => labelForPost(p, i, slice.length));
	const likes = slice.map((p) => p.likes ?? 0);
	const engagement = slice.map((p) =>
		inf.followers > 0
			? ((p.likes ?? 0) + (p.comments ?? 0)) / inf.followers * 100
			: 0
	);
	const peakLikes = Math.max(0, ...likes);
	const peakEng   = Math.max(0, ...engagement);
	return { count: slice.length, labels, likes, engagement, peakLikes, peakEng };
};

export const GrowthSection = ({ inf, posts }: Props) => {
	const series = useMemo(() => buildSeries(inf, posts), [inf, posts]);

	if (!series.count) {
		return (
			<div className="glass" style={{ padding: 28, color: "var(--tx-3)" }}>
				No posts in the DB yet — open the <strong>POSTS</strong> tab and click{" "}
				<strong>FETCH 10 NEW POSTS</strong> to start populating these charts.
			</div>
		);
	}

	return (
		<div className="chart-grid">
			<div className="glass">
				<div className="chart-head">
					<div>
						<h3>Likes per post · last {series.count}</h3>
						<div className="sub">
							Real likes per stored post, oldest → newest. Hover a bar to see the post date and exact count. Peak {compactNum(series.peakLikes)}.
						</div>
					</div>
					<span className="badge neon">avg {compactNum(inf.avgLikes)}</span>
				</div>
				<div className="chart-area">
					<BarChart
						data={series.likes}
						color="#8b5cf6"
						labels={series.labels}
						formatValue={(v) => compactNum(v)}
					/>
				</div>
			</div>

			<div className="glass">
				<div className="chart-head">
					<div>
						<h3>Engagement rate per post · last {series.count}</h3>
						<div className="sub">
							(likes + comments) / {compactNum(inf.followers)} followers, as %. Hover a bar to see the rate and the post that produced it. Peak {series.peakEng.toFixed(2)}%.
						</div>
					</div>
					<span className="badge neon">avg {fmtPercent(inf.engagementRate / 100)}</span>
				</div>
				<div className="chart-area">
					<BarChart
						data={series.engagement}
						color="#22d3ee"
						labels={series.labels}
						formatValue={(v) => v.toFixed(2)}
						yAxisSuffix="%"
					/>
				</div>
			</div>
		</div>
	);
};
