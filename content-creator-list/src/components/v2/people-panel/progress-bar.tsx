export const ProgressBar = ({ pct, blocked }: { pct: number; blocked?: boolean }) => (
	<div style={{
		marginTop: 10,
		height: 6,
		borderRadius: 999,
		background: "rgba(255,255,255,0.05)",
		overflow: "hidden",
	}}>
		<div style={{
			width: `${Math.max(2, pct)}%`,
			height: "100%",
			background: blocked
				? "linear-gradient(90deg, #ffb547, #ff5470)"
				: "linear-gradient(90deg, #8b5cf6, #22d3ee)",
			boxShadow: blocked ? "0 0 12px rgba(255,84,112,0.4)" : "0 0 12px rgba(139,92,246,0.4)",
		}} />
	</div>
);
