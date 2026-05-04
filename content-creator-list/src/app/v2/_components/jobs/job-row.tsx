"use client";

import { useState } from "react";
import Link from "next/link";
import { jobsApi } from "@/lib/api-endpoints";
import { fmtRel } from "@/lib/format";
import { JobStatusBadge } from "./job-status-badge";
import type { Job } from "./use-jobs";

const KIND_LABEL: Record<string, string> = {
	scrape:    "Profile scrape",
	followers: "Followers fetch",
	following: "Following fetch",
};

const isRetryable = (status: string) => status === "failed" || status === "completed";

type Props = { job: Job; onRetried: () => void };

export const JobRow = ({ job, onRetried }: Props) => {
	const [retrying, setRetrying] = useState(false);
	const [retryError, setRetryError] = useState<string | null>(null);

	const onRetry = async () => {
		setRetryError(null);
		setRetrying(true);
		try {
			await jobsApi.retry(job.id);
			onRetried();
		} catch (err) {
			setRetryError(err instanceof Error ? err.message : String(err));
		} finally {
			setRetrying(false);
		}
	};

	return (
		<tr>
			<td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
				<JobStatusBadge status={job.status} />
			</td>
			<td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--tx-2)" }}>
				{KIND_LABEL[job.kind] || job.kind}
			</td>
			<td style={{ padding: "10px 12px", fontSize: 13 }}>
				<Link
					href={`/v2/influencers/${job.platform}/${job.username}`}
					style={{ color: "var(--tx-1)", borderBottom: "1px dashed var(--line-2)" }}
				>
					@{job.username}
				</Link>
				<span className="mono" style={{ marginLeft: 8, color: "var(--tx-3)", fontSize: 11 }}>
					· {job.platform}
				</span>
			</td>
			<td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--tx-3)" }}>
				{fmtRel(job.createdAt)}
			</td>
			<td style={{
				padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 11,
				color: job.error ? "#ff8aa0" : "var(--tx-4)",
				maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
			}} title={job.error || undefined}>
				{job.error || "—"}
				{retryError && (
					<div style={{ color: "#ff8aa0", marginTop: 4 }}>retry failed: {retryError}</div>
				)}
			</td>
			<td style={{ padding: "10px 12px", textAlign: "right" }}>
				<button
					className="btn btn-sm btn-primary"
					onClick={onRetry}
					disabled={retrying || !isRetryable(job.status)}
					title={isRetryable(job.status) ? "Re-enqueue this job" : "Wait for the current attempt to finish"}
				>
					{retrying ? "QUEUING…" : "RETRY"}
				</button>
			</td>
		</tr>
	);
};
