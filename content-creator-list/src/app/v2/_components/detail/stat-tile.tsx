import type { ReactNode } from "react";
import { fmtPct } from "@/lib/format";

type Props = {
	label: string;
	value: ReactNode;
	delta?: number | null;
	glow?: boolean;
	exact?: number;
	hint?: string;
};

export const StatTile = ({ label, value, delta, glow, exact, hint }: Props) => {
	const tip = exact != null ? Number(exact).toLocaleString() : undefined;
	return (
		<div className={`stat-tile ${glow ? "glow" : ""}`} title={hint}>
			<div className="label">
				{label}
				{hint && (
					<span
						style={{
							marginLeft: 6, opacity: 0.6,
							fontSize: 9, cursor: "help",
							border: "1px solid var(--line-2)",
							borderRadius: 999, padding: "0 4px",
						}}
						title={hint}
					>?</span>
				)}
			</div>
			<div className="value" title={tip}>{value}</div>
			{delta != null && (
				<div className={`delta ${delta >= 0 ? "delta-pos" : "delta-neg"}`}>{fmtPct(delta, 2)}</div>
			)}
		</div>
	);
};
