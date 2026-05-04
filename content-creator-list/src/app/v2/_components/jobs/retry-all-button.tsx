"use client";

import { useState } from "react";
import { jobsApi } from "@/lib/api-endpoints";

type Props = {
	status: string;
	kind: string;
	platform: string;
	username: string;
	disabled?: boolean;
	onDone: () => void;
};

type Resp = { enqueued: number; total: number; deduped: number };

// Re-enqueues every job matching the current filter set. Backend caps at 200
// and de-dupes by (kind, platform, username) — the cursor on the influencer
// row already encodes "where to resume" so multiple failed attempts at the
// same target collapse to a single fresh job.
export const RetryAllButton = ({ status, kind, platform, username, disabled, onDone }: Props) => {
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<Resp | null>(null);
	const [error, setError] = useState<string | null>(null);

	const onClick = async () => {
		setBusy(true);
		setError(null);
		setResult(null);
		try {
			const r = (await jobsApi.retryAll({
				status: status || "failed",
				kind: kind || undefined,
				platform: platform || undefined,
				username: username || undefined,
			})) as Resp;
			setResult(r);
			onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const label = busy
		? "QUEUING…"
		: `RETRY ALL ${(status || "failed").toUpperCase()}`;

	return (
		<div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
			<button
				className="btn btn-sm btn-primary"
				onClick={onClick}
				disabled={busy || !!disabled}
				title="Re-enqueue every job matching the current filters"
			>
				{label}
			</button>
			{result && (
				<span className="mono" style={{ fontSize: 11, color: "#7dd3fc" }}>
					✓ {result.enqueued} queued{result.deduped ? ` · ${result.deduped} deduped` : ""}
				</span>
			)}
			{error && (
				<span className="mono" style={{ fontSize: 11, color: "#ff8aa0" }}>
					{error}
				</span>
			)}
		</div>
	);
};
