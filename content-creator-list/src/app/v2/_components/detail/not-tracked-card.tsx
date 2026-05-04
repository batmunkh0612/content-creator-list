"use client";

import Link from "next/link";
import { Icon } from "@/components/v2/icon";
import { TERMINAL, type DetailJob } from "./use-detail";

type Props = {
	platform: string;
	username: string;
	job: DetailJob | null;
	jobError: unknown;
	onScrape: () => void;
};

export const NotTrackedCard = ({ platform, username, job, jobError, onScrape }: Props) => {
	const isRunning = !!job && !TERMINAL.has(job.status);
	const errMsg = jobError instanceof Error ? jobError.message : jobError ? String(jobError) : null;

	return (
		<div className="glass" style={{ textAlign: "center", padding: 60, maxWidth: 560, margin: "0 auto" }}>
			<div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
				NOT TRACKED YET
			</div>
			<h2 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.02em" }}>@{username}</h2>
			<p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
				We don&apos;t have a {platform} profile for this handle yet. Scrape it now and the page will populate as soon as the worker finishes.
			</p>

			<div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
				<Link href="/v2" className="btn btn-sm btn-ghost">← Leaderboard</Link>
				<button className="btn btn-primary" onClick={onScrape} disabled={isRunning}>
					{isRunning
						? `${(job?.status || "WAITING").toUpperCase()}…`
						: <>SCRAPE @{username} <Icon name="radar" size={13} /></>}
				</button>
			</div>

			{job && (
				<div className="mono" style={{ marginTop: 14, fontSize: 11, color: "var(--tx-3)" }}>
					job {String(job.jobId || "").slice(0, 18)}… · {String(job.status || "").toUpperCase()}
					{job.status === "failed" && job.error && (
						<div style={{ marginTop: 8, color: "#ff8aa0" }}>
							{String(job.error).slice(0, 200)}
						</div>
					)}
				</div>
			)}
			{errMsg && (
				<div style={{
					marginTop: 12, padding: "10px 14px",
					background: "rgba(255,84,112,0.10)",
					border: "1px solid rgba(255,84,112,0.3)",
					borderRadius: 10,
					color: "#ff8aa0",
					fontFamily: "var(--mono)", fontSize: 12,
				}}>
					{errMsg}
				</div>
			)}
		</div>
	);
};
