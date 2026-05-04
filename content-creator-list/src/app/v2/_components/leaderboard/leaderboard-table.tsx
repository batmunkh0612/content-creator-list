"use client";

import type { V2Influencer } from "@/lib/adapter";
import { Row } from "./row";
import { SkeletonRow } from "./skeleton-row";

type Props = {
	loading: boolean;
	hasData: boolean;
	q: string;
	filtered: V2Influencer[];
	offset: number;
	showMedal: boolean;
};

export const LeaderboardTable = ({ loading, hasData, q, filtered, offset, showMedal }: Props) => (
	<div className="lb">
		<div className="lb-head">
			<div>RANK</div>
			<div>CREATOR</div>
			<div className="col-platform num">PLATFORM</div>
			<div className="num">FOLLOWERS</div>
			<div className="num">GROWTH</div>
			<div className="num">ENGAGE</div>
			<div className="num">SCORE</div>
			<div className="col-spark num">14D</div>
		</div>
		<div className="stagger">
			{loading && !hasData ? (
				Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
			) : filtered.length === 0 ? (
				<div style={{ padding: "60px 22px", textAlign: "center", color: "var(--tx-3)" }}>
					<p style={{ margin: 0, fontSize: 14 }}>
						{q ? `No creators match "${q}".` : "No creators tracked yet for this filter."}
					</p>
					<p className="mono" style={{ margin: "8px 0 0", fontSize: 11, color: "var(--tx-4)" }}>
						Use the scrape input at the top to add one.
					</p>
				</div>
			) : (
				filtered.map((inf, i) => (
					<Row key={inf.id} inf={inf} idx={offset + i} showMedal={showMedal} />
				))
			)}
		</div>
	</div>
);
