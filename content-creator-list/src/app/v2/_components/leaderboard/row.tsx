"use client";

import Link from "next/link";
import { Avatar } from "@/components/v2/avatar";
import { VerifiedTick } from "@/components/v2/verified-tick";
import { PlatformPill, StatusBadge } from "@/components/v2/badges";
import { Sparkline } from "@/components/v2/sparkline";
import { AnimatedCounter } from "@/components/v2/animated-counter";
import { compactNum, fmtPct } from "@/lib/format";
import type { V2Influencer } from "@/lib/adapter";

const rankClass = (showMedal: boolean | undefined, idx: number) =>
	showMedal && idx === 0 ? "gold" :
	showMedal && idx === 1 ? "silver" :
	showMedal && idx === 2 ? "bronze" : "";

export const Row = ({ inf, idx, showMedal }: { inf: V2Influencer; idx: number; showMedal?: boolean }) => {
	const rankCls = rankClass(showMedal, idx);
	const top1 = !!showMedal && idx === 0;
	const flameCls = inf.trendingScore > 88 ? "hot" : "";

	return (
		<Link
			href={`/v2/influencers/${inf.platform}/${inf.username}`}
			className={`lb-row ${top1 ? "top1" : ""}`}
			style={{ textDecoration: "none", color: "inherit" }}
		>
			<div>
				<span className={`rank ${rankCls}`}>{String(idx + 1).padStart(2, "0")}</span>
			</div>
			<div className="handle-cell">
				<Avatar inf={inf} />
				<div className="handle-meta">
					<div className="handle-name">
						@{inf.username}
						{inf.isVerified && <span className="verified"><VerifiedTick size={14} /></span>}
						<StatusBadge status={inf.status} />
					</div>
					<div className="handle-sub">
						<PlatformPill platform={inf.platform} />
						{inf.fullName && (
							<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
								{inf.fullName}
							</span>
						)}
					</div>
				</div>
			</div>
			<div className="col-platform" style={{ textAlign: "right" }}>
				<span className="mono" style={{ fontSize: 12, color: "var(--tx-3)", textTransform: "capitalize" }}>{inf.platform}</span>
			</div>
			<div className="num-cell">
				<AnimatedCounter value={inf.followers} />
				<div className="num-sub">{(inf.followersDelta >= 0 ? "+" : "") + compactNum(inf.followersDelta)} 24h · est.</div>
			</div>
			<div className="num-cell">
				<span className={inf.growthDay >= 0 ? "delta-pos" : "delta-neg"}>{Math.abs(inf.growthDay).toFixed(2)}%</span>
				<div className="num-sub" style={{ color: inf.growthWeek >= 0 ? "var(--pos)" : "var(--neg)" }}>
					{fmtPct(inf.growthWeek, 1)} 7d
				</div>
			</div>
			<div className="num-cell">
				{inf.engagementRate.toFixed(2)}%
				<div className="num-sub">avg engagement</div>
			</div>
			<div className="score-cell">
				<span className={`score-flame ${flameCls}`}>🔥 {inf.trendingScore}</span>
			</div>
			<div className="col-spark">
				<div className="spark-cell">
					<Sparkline data={inf.spark} color={inf.growthDay >= 0 ? "#22d39d" : "#ff5470"} glow={top1} />
				</div>
			</div>
		</Link>
	);
};
