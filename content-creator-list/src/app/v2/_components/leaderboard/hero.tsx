"use client";

import Link from "next/link";
import { ScrapeForm } from "@/components/v2/scrape-form";
import { AnimatedCounter } from "@/components/v2/animated-counter";
import { Sparkline } from "@/components/v2/sparkline";
import { Avatar } from "@/components/v2/avatar";
import { VerifiedTick } from "@/components/v2/verified-tick";
import { StatusBadge } from "@/components/v2/badges";
import { Icon } from "@/components/v2/icon";
import { compactNum } from "@/lib/format";
import type { V2Influencer } from "@/lib/adapter";

export type ModalKey = "bulk" | "refresh" | "fers" | "fing" | null;

type Props = {
	items?: V2Influencer[];
	total?: number;
	onOpenModal?: (k: ModalKey) => void;
	onScrapeEnqueued?: () => void;
};

const FleetButtons = ({ onOpenModal }: { onOpenModal?: (k: ModalKey) => void }) => (
	<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
		<button className="btn btn-sm btn-ghost" onClick={() => onOpenModal?.("bulk")}>
			<Icon name="users" size={13} /> Bulk import
		</button>
		<button className="btn btn-sm btn-ghost" onClick={() => onOpenModal?.("refresh")}>
			<Icon name="radar" size={13} /> Re-scrape all
		</button>
		<button className="btn btn-sm btn-ghost" onClick={() => onOpenModal?.("fers")} title="Instagram only">
			<Icon name="download" size={13} /> Fetch all followers
		</button>
		<button className="btn btn-sm btn-ghost" onClick={() => onOpenModal?.("fing")} title="Instagram only">
			<Icon name="download" size={13} /> Fetch all following
		</button>
	</div>
);

const HeroStats = ({ total, totalFollowers, top }: { total?: number; totalFollowers: number; top?: V2Influencer }) => (
	<div className="hero-stats">
		<div className="hero-stat">
			<div className="label">Tracked Creators</div>
			<div className="value"><AnimatedCounter value={total || 0} format={(n) => n.toLocaleString()} /></div>
			<div className="delta delta-pos">across all platforms</div>
			<div className="spark"><Sparkline data={[40, 42, 48, 50, 55, 60, 62, 68, 72, 80, 88, 92]} color="#8b5cf6" glow /></div>
		</div>
		<div className="hero-stat">
			<div className="label">Aggregate Reach (page)</div>
			<div className="value"><AnimatedCounter value={totalFollowers} /></div>
			<div className="delta delta-pos">summed from current page</div>
			<div className="spark"><Sparkline data={[30, 35, 40, 42, 46, 52, 58, 60, 62, 68, 74, 80]} color="#22d3ee" glow /></div>
		</div>
		{top && (
			<div className="hero-stat" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 16 }}>
				<Avatar inf={top} size="lg" />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div className="label">#1 RIGHT NOW</div>
					<div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
						@{top.username} {top.isVerified && <VerifiedTick size={14} />}
					</div>
					<div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", marginTop: 2 }}>
						{compactNum(top.followers)} followers · trending {top.trendingScore}/100
					</div>
				</div>
				<StatusBadge status={top.status} />
			</div>
		)}
	</div>
);

export const Hero = ({ items, total, onOpenModal, onScrapeEnqueued }: Props) => {
	const top = (items || [])[0];
	const totalFollowers = (items || []).reduce((a, b) => a + (b.followers || 0), 0);

	return (
		<div className="hero fade-up">
			<div className="hero-grid">
				<div>
					<div className="live-ticker" style={{ marginBottom: 18 }}>
						<span className="pulse-dot" /> LIVE · UPDATED CONTINUOUSLY
					</div>
					<h1>Track the <span className="gloss">fastest growing</span> creators in real-time.</h1>
					<p>
						Real engagement, real followers, real signals — pulled from Instagram, TikTok, YouTube, and Facebook.
						Built on top of your existing scrape pipeline.
					</p>
					<div style={{ marginBottom: 12 }}>
						<ScrapeForm onEnqueued={onScrapeEnqueued} navigateOnSuccess={false} />
					</div>
					<FleetButtons onOpenModal={onOpenModal} />
					<div className="hero-cta-row">
						<Link href="/v2/trending" className="btn btn-primary">
							Trending Now <Icon name="fire" size={14} />
						</Link>
					</div>
				</div>
				<HeroStats total={total} totalFollowers={totalFollowers} top={top} />
			</div>
		</div>
	);
};
