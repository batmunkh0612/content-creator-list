"use client";

import { useMemo } from "react";
import { BarChart } from "@/components/v2/bar-chart";
import { fmtRelDate } from "@/lib/format";
import type { Post } from "./post-card";

type Props = { posts: Post[] };

const MEDIA_COLORS: Record<string, string> = {
	image:    "#8b5cf6",
	video:    "#22d3ee",
	carousel: "#22d39d",
	reel:     "#ec4899",
	other:    "#9aa0ae",
};

// Compute days between consecutive posts (latest 25 gaps, oldest → newest).
const buildCadence = (posts: Post[]) => {
	const dated = posts
		.filter((p) => !!p.postedAt)
		.map((p) => new Date(p.postedAt as string).getTime())
		.sort((a, b) => a - b); // ascending
	if (dated.length < 2) {
		return { gaps: [] as number[], labels: [] as string[], avg: 0, last: null as string | null };
	}

	const gaps: number[] = [];
	const labels: string[] = [];
	for (let i = 1; i < dated.length; i += 1) {
		gaps.push((dated[i] - dated[i - 1]) / 86_400_000);
		const fromIso = new Date(dated[i - 1]).toISOString().slice(0, 10);
		const toIso   = new Date(dated[i]).toISOString().slice(0, 10);
		labels.push(`${fromIso} → ${toIso}`);
	}
	// Keep label/gap arrays in sync when we trim to the recent N.
	const recent = gaps.slice(-25);
	const recentLabels = labels.slice(-25);
	const avg = recent.reduce((s, g) => s + g, 0) / recent.length;
	return {
		gaps: recent,
		labels: recentLabels,
		avg,
		last: new Date(dated[dated.length - 1]).toISOString(),
	};
};

const buildMediaMix = (posts: Post[]) => {
	const counts = new Map<string, number>();
	for (const p of posts) {
		const k = (p.mediaType || "other").toLowerCase();
		counts.set(k, (counts.get(k) || 0) + 1);
	}
	const total = posts.length || 1;
	return Array.from(counts.entries())
		.map(([type, count]) => ({
			type,
			count,
			pct: (count / total) * 100,
			color: MEDIA_COLORS[type] || MEDIA_COLORS.other,
		}))
		.sort((a, b) => b.count - a.count);
};

export const GainSection = ({ posts }: Props) => {
	const cadence = useMemo(() => buildCadence(posts), [posts]);
	const mix = useMemo(() => buildMediaMix(posts), [posts]);

	if (!posts.length) {
		return null;
	}

	return (
		<div className="chart-grid-2">
			<div className="glass">
				<div className="chart-head">
					<div>
						<h3>Posting cadence · last {cadence.gaps.length} gaps</h3>
						<div className="sub">
							Days between consecutive posts. Tall bars = long silence. Short bars = posted again quickly. Avg {cadence.avg.toFixed(1)} days/post.
							{cadence.last && <> Most recent: {fmtRelDate(cadence.last)}.</>}
						</div>
					</div>
					<span className="badge stable">{cadence.avg.toFixed(1)} d</span>
				</div>
				<div className="chart-area">
					{cadence.gaps.length > 0 ? (
						<BarChart
							data={cadence.gaps}
							color="#ffd166"
							labels={cadence.labels}
							formatValue={(v) => `${v.toFixed(1)}`}
							yAxisSuffix=" d"
						/>
					) : (
						<div style={{ padding: 28, color: "var(--tx-3)", fontSize: 13 }}>
							Need at least 2 dated posts to compute the gap.
						</div>
					)}
				</div>
			</div>

			<div className="glass">
				<div className="chart-head">
					<div>
						<h3>Content mix · {posts.length} posts</h3>
						<div className="sub">
							Breakdown of stored posts by media type. Reels are now their own bucket — see the REELS tab to fetch more.
						</div>
					</div>
				</div>
				<div className="chart-area" style={{ paddingBottom: 24 }}>
					{mix.map((m) => (
						<div key={m.type} style={{ marginBottom: 14 }}>
							<div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
								<span style={{ color: "var(--tx-2)", textTransform: "uppercase", fontFamily: "var(--mono)", letterSpacing: "0.06em", fontSize: 11 }}>
									{m.type}
								</span>
								<span className="mono" style={{ color: "var(--tx-3)" }}>
									{m.count} · {m.pct.toFixed(0)}%
								</span>
							</div>
							<div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
								<div style={{
									width: `${Math.max(2, m.pct)}%`,
									height: "100%",
									background: `linear-gradient(90deg, ${m.color}, ${m.color}88)`,
									boxShadow: `0 0 8px ${m.color}66`,
								}} />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
