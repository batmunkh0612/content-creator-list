"use client";

import { useEffect, useMemo, useState } from "react";
import { influencerApi } from "@/lib/api-endpoints";
import { toV2, type V2Influencer } from "@/lib/adapter";
import { ErrorRow } from "@/components/v2/error-row";
import type { IconName } from "@/components/v2/icon";
import { usePlatform } from "../platform-context";
import { TrendCard } from "./trend-card";
import { SkeletonCard } from "./skeleton-card";

const SECTIONS: Array<{
	key: string;
	className: string;
	icon: IconName;
	title: string;
	match: (i: V2Influencer) => boolean;
}> = [
	{ key: "viral",  className: "viral",  icon: "fire",   title: "Viral right now", match: (i) => i.status === "viral" },
	{ key: "rising", className: "rising", icon: "rocket", title: "Fastest growing", match: (i) => i.status === "rising" },
	{ key: "drop",   className: "drop",   icon: "arrow",  title: "Biggest drop",    match: (i) => i.status === "dropping" },
	{ key: "winner", className: "winner", icon: "trophy", title: "Weekly winners",  match: (i) => i.trendingScore >= 80 },
];

type ListResp = { items: Parameters<typeof toV2>[0][] };

const buildBuckets = (items: V2Influencer[] | null) => {
	const out: Record<string, V2Influencer[]> = {};
	for (const s of SECTIONS) out[s.key] = (items || []).filter(s.match).slice(0, 4);
	if (items?.length) {
		const sorted = items.slice().sort((a, b) => b.trendingScore - a.trendingScore);
		for (const s of SECTIONS) if (!out[s.key].length) out[s.key] = sorted.slice(0, 4);
	}
	return out;
};

export const TrendingPage = () => {
	const { platform } = usePlatform();
	const [items, setItems] = useState<V2Influencer[] | null>(null);
	const [error, setError] = useState<unknown>(null);

	useEffect(() => {
		let cancelled = false;
		const params: Record<string, unknown> = { limit: 100, sortBy: "engagementRate", sortDir: "desc" };
		if (platform !== "all") params.platform = platform;
		(influencerApi.list(params) as Promise<ListResp>)
			.then((d) => { if (!cancelled) setItems(d.items.map(toV2)); })
			.catch((err) => { if (!cancelled) setError(err); });
		return () => { cancelled = true; };
	}, [platform]);

	const buckets = useMemo(() => buildBuckets(items), [items]);

	if (error) return <ErrorRow err={error} />;

	return (
		<>
			<div className="sec-head">
				<div className="sec-title">
					<span className="crumb">02 — trending</span>
					<h2>What&apos;s moving</h2>
				</div>
				<div className="sec-actions">
					<span className="muted mono" style={{ fontSize: 11 }}>
						{(items || []).length} creators · auto-refreshing
					</span>
				</div>
			</div>

			{SECTIONS.map((s) => (
				<div key={s.key} style={{ marginBottom: 28 }}>
					<div className="sec-head" style={{ margin: "0 0 12px" }}>
						<div className="sec-title">
							<span className="crumb">{s.title}</span>
						</div>
					</div>
					<div className="trend-grid">
						{!items
							? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} kind={s.className} />)
							: buckets[s.key].map((inf) => <TrendCard key={inf.id} inf={inf} kind={s.className} icon={s.icon} />)
						}
					</div>
				</div>
			))}
		</>
	);
};
