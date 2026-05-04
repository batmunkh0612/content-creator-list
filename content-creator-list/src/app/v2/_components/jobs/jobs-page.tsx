"use client";

import { ErrorRow } from "@/components/v2/error-row";
import { useJobs, PAGE_SIZE } from "./use-jobs";
import { JobsFilterBar } from "./jobs-filter-bar";
import { JobsTable } from "./jobs-table";
import { JobsPagination } from "./jobs-pagination";
import { RetryAllButton } from "./retry-all-button";

export const JobsPage = () => {
	const j = useJobs();
	const hasFailures = (j.data?.items || []).some((row) => row.status === "failed");

	return (
		<>
			<div className="sec-head">
				<div className="sec-title">
					<span className="crumb">04 — jobs</span>
					<h2>Recent scrape & fetch jobs{j.data ? ` · ${j.data.total}` : ""}</h2>
				</div>
				<JobsFilterBar onRefresh={j.refresh} />
			</div>

			<div style={{
				display: "flex", justifyContent: "space-between", alignItems: "center",
				gap: 12, flexWrap: "wrap",
				marginTop: 0, marginBottom: 16,
			}}>
				<p className="mono muted" style={{ fontSize: 11, lineHeight: 1.55, margin: 0, maxWidth: 640 }}>
					Failed jobs (Instagram bans, network errors, blocked sessions) stay listed here.
					Click <strong style={{ color: "var(--tx-2)" }}>RETRY</strong> any time to re-enqueue —
					the worker will pick up where the previous attempt left off (cursor preserved).
				</p>
				<RetryAllButton
					status={j.status}
					kind={j.kind}
					platform={j.platform}
					username={j.username}
					disabled={!hasFailures && (j.status || "failed") === "failed"}
					onDone={j.refresh}
				/>
			</div>

			{j.error ? <ErrorRow err={j.error} /> : null}

			<JobsTable jobs={j.data?.items || []} loading={j.loading} onRetried={j.refresh} />

			{j.data && j.data.total > PAGE_SIZE && (
				<JobsPagination
					page={j.page}
					totalPages={j.totalPages}
					offset={j.data.offset}
					total={j.data.total}
					onPageChange={j.setPage}
				/>
			)}
		</>
	);
};
