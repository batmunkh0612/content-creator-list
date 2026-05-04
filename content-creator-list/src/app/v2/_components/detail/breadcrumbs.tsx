"use client";

import Link from "next/link";

export const BreadCrumbs = ({ username }: { username: string }) => (
	<div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
		<Link href="/v2" className="btn btn-ghost btn-sm">← Leaderboard</Link>
		<span className="mono" style={{ color: "var(--tx-3)", fontSize: 11 }}>/ @{username}</span>
	</div>
);

export const SectionHead = ({ crumb, title }: { crumb: string; title: string }) => (
	<div className="sec-head">
		<div className="sec-title">
			<span className="crumb">{crumb}</span>
			<h2>{title}</h2>
		</div>
	</div>
);
