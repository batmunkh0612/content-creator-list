"use client";

import { useEffect, useRef, useState } from "react";
import { scrapeApi } from "@/lib/api-endpoints";
import { Icon } from "@/components/v2/icon";

const POLL_MS = 2000;
const TERMINAL = new Set(["completed", "failed"]);
const BATCH = 10;

type Kind = "posts" | "reels";
type Job = { jobId: string; status: string; error?: string };

type Props = {
	platform: string;
	username: string;
	kind?: Kind;
	onDone: () => void;
};

const fetchByKind = (kind: Kind, platform: string, username: string) =>
	kind === "reels"
		? scrapeApi.fetchReels(platform, username, BATCH)
		: scrapeApi.fetchPosts(platform, username, BATCH);

const labelFor = (kind: Kind) =>
	kind === "reels" ? `FETCH ${BATCH} NEW REELS` : `FETCH ${BATCH} NEW POSTS`;

// Triggers a posts or reels job, polls until terminal, then asks the parent
// to reload. Same component used for both content types — only the endpoint
// and label differ.
export const FetchMorePostsButton = ({ platform, username, kind = "posts", onDone }: Props) => {
	const [job, setJob] = useState<Job | null>(null);
	const [error, setError] = useState<string | null>(null);
	const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const isRunning = !!job && !TERMINAL.has(job.status);

	const trigger = async () => {
		setError(null);
		try {
			const res = (await fetchByKind(kind, platform, username)) as Job;
			setJob({ jobId: res.jobId, status: res.status || "pending" });
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	useEffect(() => {
		if (!job?.jobId || TERMINAL.has(job.status)) {
			if (job && job.status === "completed") onDone();
			return;
		}
		pollTimer.current = setTimeout(async () => {
			try {
				const updated = (await scrapeApi.job(job.jobId)) as Job;
				setJob({ ...updated, jobId: job.jobId });
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		}, POLL_MS);
		return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [job]);

	const failed = job?.status === "failed";

	return (
		<div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
			<button
				className="btn btn-sm btn-primary"
				onClick={trigger}
				disabled={isRunning}
				title={kind === "reels"
					? "Walk further back in IG's reels tab and add 10 more reels"
					: "Walk further back in IG's feed and add 10 more posts"}
			>
				<Icon name="download" size={12} />
				{isRunning ? "FETCHING…" : labelFor(kind)}
			</button>
			{failed && job?.error && (
				<span className="mono" style={{ fontSize: 11, color: "#ff8aa0", maxWidth: 320, textAlign: "right" }}>
					{job.error}
				</span>
			)}
			{error && (
				<span className="mono" style={{ fontSize: 11, color: "#ff8aa0" }}>{error}</span>
			)}
		</div>
	);
};
