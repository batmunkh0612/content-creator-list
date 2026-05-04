export const SkeletonRow = () => (
	<div className="lb-row" style={{ opacity: 0.4 }}>
		<div><span className="rank">··</span></div>
		<div className="handle-cell">
			<div className="av" />
			<div style={{ flex: 1 }}>
				<div style={{ width: 140, height: 14, background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
				<div style={{ width: 90, height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 4, marginTop: 6 }} />
			</div>
		</div>
		<div /><div /><div /><div /><div /><div />
	</div>
);
