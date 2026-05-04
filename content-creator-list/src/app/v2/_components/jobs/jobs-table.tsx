"use client";

import { JobRow } from "./job-row";
import type { Job } from "./use-jobs";

const HEAD_STYLE: React.CSSProperties = {
	textAlign: "left",
	padding: "10px 12px",
	fontFamily: "var(--mono)",
	fontSize: 10,
	letterSpacing: "0.1em",
	textTransform: "uppercase",
	color: "var(--tx-3)",
	background: "rgba(255,255,255,0.02)",
	borderBottom: "1px solid var(--line-1)",
};

type Props = { jobs: Job[]; loading: boolean; onRetried: () => void };

export const JobsTable = ({ jobs, loading, onRetried }: Props) => {
	if (loading && !jobs.length) {
		return (
			<div className="glass" style={{ padding: 40, textAlign: "center", color: "var(--tx-3)" }}>
				Loading…
			</div>
		);
	}
	if (!jobs.length) {
		return (
			<div className="glass" style={{ padding: 40, textAlign: "center", color: "var(--tx-3)" }}>
				No jobs match the current filters.
			</div>
		);
	}

	return (
		<div className="glass" style={{ overflow: "hidden" }}>
			<table style={{ width: "100%", borderCollapse: "collapse" }}>
				<thead>
					<tr>
						<th style={{ ...HEAD_STYLE, width: 120 }}>Status</th>
						<th style={{ ...HEAD_STYLE, width: 160 }}>Kind</th>
						<th style={HEAD_STYLE}>Influencer</th>
						<th style={{ ...HEAD_STYLE, width: 120 }}>Created</th>
						<th style={HEAD_STYLE}>Error</th>
						<th style={{ ...HEAD_STYLE, width: 100, textAlign: "right" }}>Action</th>
					</tr>
				</thead>
				<tbody>
					{jobs.map((j) => (
						<JobRow key={j.id} job={j} onRetried={onRetried} />
					))}
				</tbody>
			</table>
		</div>
	);
};
