export const SkeletonCard = ({ kind }: { kind: string }) => (
	<div className={`trend-card ${kind}`} style={{ opacity: 0.4 }}>
		<div className="head"><div className="ico" /> Loading…</div>
		<div className="who">
			<div className="av" />
			<div style={{ width: 100, height: 14, background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
		</div>
		<div style={{ height: 30, background: "rgba(255,255,255,0.04)", borderRadius: 4, marginTop: 8 }} />
	</div>
);
