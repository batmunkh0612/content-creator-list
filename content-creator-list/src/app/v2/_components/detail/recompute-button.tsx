"use client";

import { useState } from "react";
import { influencerApi } from "@/lib/api-endpoints";
import { Icon } from "@/components/v2/icon";

type Props = {
	platform: string;
	username: string;
	onDone: () => void;
};

// Triggers POST /influencer/:p/:u/recompute-metrics — re-runs the engagement,
// avg likes/comments/views, and posts/week formulas against the latest 30
// stored posts. Cheap (one DB read + one update + cache bust); no IG calls.
export const RecomputeButton = ({ platform, username, onDone }: Props) => {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [okAt, setOkAt] = useState<number | null>(null);

	const click = async () => {
		setBusy(true);
		setError(null);
		try {
			await influencerApi.recomputeMetrics(platform, username);
			setOkAt(Date.now());
			onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const fresh = okAt && Date.now() - okAt < 4000;

	return (
		<div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
			<button
				className="btn btn-sm btn-ghost"
				onClick={click}
				disabled={busy}
				title="Re-run engagement / avg likes / avg comments / avg views / posts-per-week from the latest 30 stored posts"
			>
				<Icon name="chart" size={12} />
				{busy ? "RECOMPUTING…" : fresh ? "✓ RECOMPUTED" : "RECOMPUTE METRICS"}
			</button>
			{error && (
				<span className="mono" style={{ fontSize: 11, color: "#ff8aa0" }}>{error}</span>
			)}
		</div>
	);
};
