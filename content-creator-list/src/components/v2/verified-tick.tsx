export const VerifiedTick = ({ size = 14 }: { size?: number }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
		<path
			d="M12 1.5l2.4 2 3.1-.4 1.7 2.6 2.9 1.2-.5 3.1 1.7 2.6-2 2.4.4 3.1-2.6 1.7-1.2 2.9-3.1-.5-2.6 1.7-2.4-2-3.1.4-1.7-2.6-2.9-1.2.5-3.1L1 12l2-2.4-.4-3.1 2.6-1.7 1.2-2.9 3.1.5z"
			fill="#22d3ee"
		/>
		<path
			d="m8 12 3 3 5-6"
			stroke="#0b0b12"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			fill="none"
		/>
	</svg>
);
