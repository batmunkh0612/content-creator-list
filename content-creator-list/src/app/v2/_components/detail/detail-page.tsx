"use client";

import { useDetail } from "./use-detail";
import { BreadCrumbs, SectionHead } from "./breadcrumbs";
import { DetailHero } from "./detail-hero";
import { GrowthSection } from "./growth-section";
import { GainSection } from "./gain-section";
import { ContentTabs } from "./content-tabs";
import { NotTrackedCard } from "./not-tracked-card";
import type { Post } from "./post-card";

type Props = { platform: string; username: string };

export const DetailPage = ({ platform, username }: Props) => {
	const d = useDetail({ platform, username });

	if (d.notFound) {
		return (
			<NotTrackedCard
				platform={platform}
				username={username}
				job={d.job}
				jobError={d.jobError}
				onScrape={d.triggerScrape}
			/>
		);
	}

	if (d.loading || !d.inf) {
		return (
			<div className="glass" style={{ padding: 60, textAlign: "center", color: "var(--tx-3)" }}>
				Loading @{username}…
			</div>
		);
	}

	if (d.error) {
		const msg = d.error instanceof Error ? d.error.message : String(d.error);
		return (
			<div style={{
				padding: 16, borderRadius: 12,
				background: "rgba(255,84,112,0.1)",
				border: "1px solid rgba(255,84,112,0.3)",
				color: "#ff8aa0", fontFamily: "var(--mono)", fontSize: 13,
			}}>
				{msg}
			</div>
		);
	}

	return (
		<>
			<BreadCrumbs username={d.inf.username} />
			<DetailHero
				inf={d.inf}
				job={d.job}
				jobError={d.jobError}
				onScrape={d.triggerScrape}
				onExport={d.exportJson}
				onReload={d.reload}
			/>
			<SectionHead crumb="02 — performance" title="Performance per post" />
			<GrowthSection inf={d.inf} posts={(d.raw?.posts || []) as Post[]} />
			<SectionHead crumb="03 — cadence" title="Posting cadence & content mix" />
			<GainSection posts={(d.raw?.posts || []) as Post[]} />
			<ContentTabs inf={d.inf} raw={d.raw} onReload={d.reload} />
		</>
	);
};
