"use client";

import { useState } from "react";
import Link from "next/link";
import { proxiedImage } from "@/lib/image-proxy";
import { compactNum } from "@/lib/format";
import { VerifiedTick } from "../verified-tick";
import { TrackButton } from "./track-button";
import type { Person } from "./use-people-data";

const Stat = ({ label, value }: { label: string; value: string }) => (
	<div style={{ minWidth: 0 }}>
		<div style={{ fontSize: 8, color: "var(--tx-4)", letterSpacing: "0.08em" }}>{label}</div>
		<div style={{
			fontSize: 11, fontWeight: 600, color: "var(--tx-1)",
			marginTop: 2, fontVariantNumeric: "tabular-nums",
			overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
		}}>{value}</div>
	</div>
);

const sharedStyle: React.CSSProperties = {
	display: "block", overflow: "hidden",
	color: "inherit", textDecoration: "none",
	transition: "transform 200ms ease, border-color 200ms ease",
};

const sharedHandlers = {
	onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; },
	onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.transform = "none"; },
};

type Props = { p: Person; platform?: string; onScraped?: () => void };

export const PersonCard = ({ p, platform = "instagram", onScraped }: Props) => {
	const [broken, setBroken] = useState(false);
	const initials = (p.username || "").slice(0, 2).toUpperCase();
	const proxied = proxiedImage(p.profilePicUrl);

	const inner = (
		<>
			<div style={{
				position: "relative", aspectRatio: "1/1",
				background: "linear-gradient(135deg,#8b5cf6,#22d3ee)",
				borderBottom: "1px solid var(--line-1)",
				display: "grid", placeItems: "center",
			}}>
				{proxied && !broken ? (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img src={proxied} alt="" loading="lazy" onError={() => setBroken(true)}
						style={{ width: "100%", height: "100%", objectFit: "cover" }} />
				) : (
					<span style={{ color: "#0b0b12", fontSize: 28, fontWeight: 700 }}>{initials}</span>
				)}
				{p.isVerified && (
					<span style={{
						position: "absolute", top: 8, right: 8,
						background: "rgba(11,11,18,0.7)", backdropFilter: "blur(4px)",
						border: "1px solid rgba(34,211,238,0.4)",
						borderRadius: 999, padding: 3,
					}}><VerifiedTick size={12} /></span>
				)}
				{!p.tracked && <TrackButton username={p.username} onScraped={onScraped} />}
				{p.isPrivate && (
					<span style={{
						position: "absolute", bottom: 8, left: 8,
						background: "rgba(11,11,18,0.7)", backdropFilter: "blur(4px)",
						border: "1px solid var(--line-2)",
						borderRadius: 999, padding: "2px 8px",
						fontSize: 10, color: "var(--tx-2)", letterSpacing: "0.04em",
					}}>🔒 PRIVATE</span>
				)}
			</div>
			<div style={{ padding: "10px 12px" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
					<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>@{p.username}</span>
					{p.tracked && (
						<span title="Also a tracked profile in your workspace" style={{
							fontSize: 9, fontFamily: "var(--mono)", letterSpacing: "0.08em",
							color: "#c4b5ff", background: "rgba(139,92,246,0.16)",
							border: "1px solid rgba(139,92,246,0.45)", borderRadius: 4, padding: "1px 5px", flexShrink: 0,
						}}>★</span>
					)}
				</div>
				{p.fullName && (
					<div style={{ fontSize: 11, color: "var(--tx-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--mono)" }}>
						{p.fullName}
					</div>
				)}
				{p.tracked && (
					<div style={{
						marginTop: 8, paddingTop: 8,
						borderTop: "1px solid var(--line-1)",
						display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
						fontFamily: "var(--mono)",
					}}>
						<Stat label="FOLLOWERS" value={p.followersCount != null ? compactNum(p.followersCount) : "—"} />
						<Stat label="POSTS"     value={p.postsCount != null ? compactNum(p.postsCount) : "—"} />
						<Stat label="ENG"       value={p.engagementRate != null ? `${(p.engagementRate * 100).toFixed(1)}%` : "—"} />
					</div>
				)}
			</div>
		</>
	);

	return p.tracked ? (
		<Link href={`/v2/influencers/${platform}/${p.username}`} title="Open scraped profile" className="glass" style={sharedStyle} {...sharedHandlers}>
			{inner}
		</Link>
	) : (
		<a href={`https://www.instagram.com/${p.username}/`} target="_blank" rel="noreferrer"
			title="Open on Instagram (not yet scraped — click + SCRAPE to add)" className="glass" style={sharedStyle} {...sharedHandlers}>
			{inner}
		</a>
	);
};
