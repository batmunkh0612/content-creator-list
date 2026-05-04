"use client";

import Link from "next/link";
import { Avatar } from "@/components/v2/avatar";
import { VerifiedTick } from "@/components/v2/verified-tick";
import { PlatformPill } from "@/components/v2/badges";
import { Icon, type IconName } from "@/components/v2/icon";
import { compactNum } from "@/lib/format";
import type { V2Influencer } from "@/lib/adapter";

const LABEL_BY_KIND: Record<string, string> = {
	viral:  "VIRAL",
	rising: "RISING",
	drop:   "DROPPING",
	winner: "WEEKLY WINNER",
};

const metricFor = (kind: string, inf: V2Influencer): { value: string; label: string } => {
	if (kind === "rising" || kind === "drop") {
		return {
			value: `${(inf.growthDay > 0 ? "+" : "")}${inf.growthDay.toFixed(2)}%`,
			label: "24H GROWTH",
		};
	}
	if (kind === "winner") return { value: `${inf.trendingScore}`, label: "TRENDING SCORE" };
	return { value: `${inf.engagementRate.toFixed(2)}%`, label: "ENGAGEMENT" };
};

type Props = { inf: V2Influencer; kind: string; icon: IconName };

export const TrendCard = ({ inf, kind, icon }: Props) => {
	const m = metricFor(kind, inf);
	return (
		<Link
			href={`/v2/influencers/${inf.platform}/${inf.username}`}
			className={`trend-card ${kind}`}
			style={{ textDecoration: "none", color: "inherit", display: "block" }}
		>
			<div className="head">
				<div className="ico"><Icon name={icon} size={14} /></div>
				{LABEL_BY_KIND[kind]}
			</div>
			<div className="who">
				<Avatar inf={inf} />
				<div>
					<div className="name">
						@{inf.username}
						{inf.isVerified && <VerifiedTick size={12} />}
					</div>
					<div className="sub">{compactNum(inf.followers)} followers</div>
				</div>
			</div>
			<div className="metric">{m.value}</div>
			<div className="metric-label">{m.label}</div>
			<div className="footer-row">
				<PlatformPill platform={inf.platform} />
				<span>{compactNum(inf.followersDelta)} 24h</span>
			</div>
		</Link>
	);
};
