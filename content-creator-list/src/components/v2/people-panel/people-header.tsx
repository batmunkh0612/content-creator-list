"use client";

import { compactNum, fmtRel } from "@/lib/format";
import { ErrorRow } from "../error-row";
import { ProgressBar } from "./progress-bar";
import { JobErrorRow } from "./job-error-row";
import { TERMINAL, type PanelJob } from "./use-people-data";

type Props = {
	title: string;
	fetched: number;
	totalProfileCount: number;
	trackedOverlap: number;
	blocked?: boolean;
	lastFetchedAt?: string | null;
	pct: number;
	job: PanelJob | null;
	scrapeError: unknown;
	batchSize: number;
	onRefetch: () => void;
};

export const PeopleHeader = ({
	title, fetched, totalProfileCount, trackedOverlap,
	blocked, lastFetchedAt, pct, job, scrapeError, batchSize, onRefetch,
}: Props) => {
	const isRunning = !!job && !TERMINAL.has(job.status);
	const refetchLabel = fetched > 0 ? `FETCH ${batchSize} MORE` : `FETCH ${batchSize}`;

	return (
		<div className="glass" style={{ padding: 20, marginBottom: 16 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
				<div style={{ flex: 1, minWidth: 240 }}>
					<div className="mono" style={{ fontSize: 10, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
						{title}
						{lastFetchedAt && <span style={{ marginLeft: 12 }}>· LAST {fmtRel(lastFetchedAt)}</span>}
					</div>
					<div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
						{Number(fetched).toLocaleString()}
						{totalProfileCount > 0 && (
							<span style={{ color: "var(--tx-3)", fontSize: 16, fontWeight: 400 }}>
								{" "} / {compactNum(totalProfileCount)}
							</span>
						)}
					</div>
					{trackedOverlap > 0 && (
						<div className="mono" style={{ fontSize: 11, color: "#c4b5ff", marginTop: 6 }}>
							★ {trackedOverlap} of {Number(fetched).toLocaleString()} are also tracked profiles — counts shown on the cards.
						</div>
					)}
					<ProgressBar pct={pct} blocked={blocked} />
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					{job && (
						<span className={`badge ${job.status === "failed" ? "dropping" : job.status === "completed" ? "rising" : "neon"}`}>
							{String(job.status).toUpperCase()}
						</span>
					)}
					<button onClick={onRefetch} className="btn btn-primary" disabled={isRunning}>
						{isRunning ? "FETCHING…" : refetchLabel}
					</button>
				</div>
			</div>
			{blocked && (
				<div style={{
					marginTop: 14, padding: "10px 14px",
					background: "rgba(255,181,71,0.12)",
					border: "1px solid rgba(255,181,71,0.3)",
					borderRadius: 10,
					color: "#ffd49a", fontSize: 12,
				}}>
					<strong>Stopped early</strong> · Instagram closed pagination. The list above is what we captured before the cutoff.
				</div>
			)}
			{job?.status === "failed" && job.error && <JobErrorRow message={job.error} />}
			{scrapeError ? <ErrorRow err={scrapeError} /> : null}
		</div>
	);
};
