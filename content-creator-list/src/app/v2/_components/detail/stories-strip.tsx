"use client";

import { useEffect, useRef, useState } from "react";
import { scrapeApi } from "@/lib/api-endpoints";
import { proxiedImage } from "@/lib/image-proxy";
import { compactNum, fmtRel } from "@/lib/format";
import { Icon } from "@/components/v2/icon";

const POLL_MS = 2000;
const TERMINAL = new Set(["completed", "failed"]);

export type Story = {
	id: string;
	storyId: string;
	mediaType?: string | null;
	mediaUrl?: string | null;
	thumbnailUrl?: string | null;
	views?: number | null;
	takenAt?: string | null;
	expiresAt?: string | null;
};

type Props = {
	stories: Story[];
	platform: string;
	username: string;
	onReload: () => void;
};

const isLive = (s: Story) => !!s.expiresAt && new Date(s.expiresAt).getTime() > Date.now();

type Job = { jobId: string; status: string; error?: string };

const FetchStoriesButton = ({ platform, username, onDone }: { platform: string; username: string; onDone: () => void }) => {
	const [job, setJob] = useState<Job | null>(null);
	const [error, setError] = useState<string | null>(null);
	const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isRunning = !!job && !TERMINAL.has(job.status);

	const trigger = async () => {
		setError(null);
		try {
			const res = (await scrapeApi.fetchStories(platform, username)) as Job;
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

	return (
		<div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
			<button className="btn btn-sm btn-primary" onClick={trigger} disabled={isRunning}>
				<Icon name="download" size={12} />
				{isRunning ? "FETCHING…" : "FETCH STORIES"}
			</button>
			{job?.status === "failed" && job.error && (
				<span className="mono" style={{ fontSize: 11, color: "#ff8aa0", maxWidth: 320, textAlign: "right" }}>
					{job.error}
				</span>
			)}
			{error && <span className="mono" style={{ fontSize: 11, color: "#ff8aa0" }}>{error}</span>}
		</div>
	);
};

const StoryCard = ({ s }: { s: Story }) => {
	const [broken, setBroken] = useState(false);
	const proxied = proxiedImage(s.thumbnailUrl || s.mediaUrl);
	const live = isLive(s);
	const minsLeft = live && s.expiresAt
		? Math.max(0, Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / 60_000))
		: null;

	return (
		<div className="glass" style={{
			width: 140, flexShrink: 0,
			border: live ? "1px solid rgba(139,92,246,0.55)" : "1px solid var(--line-2)",
			boxShadow: live ? "0 0 14px rgba(139,92,246,0.18)" : undefined,
			overflow: "hidden",
		}}>
			<div style={{
				position: "relative",
				aspectRatio: "9/16",
				background: "linear-gradient(135deg,#1f1f30,#0b0b12)",
				display: "grid", placeItems: "center",
			}}>
				{proxied && !broken ? (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img src={proxied} alt="" loading="lazy" onError={() => setBroken(true)}
						style={{ width: "100%", height: "100%", objectFit: "cover" }} />
				) : (
					<span style={{ color: "var(--tx-3)", fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase" }}>
						{s.mediaType || "story"}
					</span>
				)}
				{s.mediaType === "video" && (
					<span style={{
						position: "absolute", top: 8, right: 8,
						background: "rgba(11,11,18,0.7)",
						border: "1px solid var(--line-2)",
						borderRadius: 6, padding: "2px 6px",
						fontFamily: "var(--mono)", fontSize: 10, color: "#fff",
					}}>▶</span>
				)}
				{live && (
					<span style={{
						position: "absolute", top: 8, left: 8,
						background: "rgba(139,92,246,0.85)",
						border: "1px solid rgba(139,92,246,1)",
						borderRadius: 999, padding: "2px 8px",
						fontFamily: "var(--mono)", fontSize: 10, color: "#fff",
						letterSpacing: "0.06em",
					}}>LIVE · {minsLeft}m</span>
				)}
			</div>
			<div style={{ padding: "8px 10px", fontFamily: "var(--mono)", fontSize: 10, color: "var(--tx-3)" }}>
				<div>{s.takenAt ? fmtRel(s.takenAt) : "—"}</div>
				{s.views != null && <div style={{ color: "#c4b5ff" }}>{compactNum(s.views)} views</div>}
			</div>
		</div>
	);
};

export const StoriesStrip = ({ stories, platform, username, onReload }: Props) => {
	const live = stories.filter(isLive);
	const history = stories.filter((s) => !isLive(s));

	if (!stories.length) {
		return (
			<div className="glass" style={{ padding: 28, color: "var(--tx-3)", textAlign: "center" }}>
				<div style={{ fontSize: 13 }}>
					No stories captured. IG stories expire after 24h — click below to snapshot the currently active set.
				</div>
				<div style={{ marginTop: 14, display: "inline-flex" }}>
					<FetchStoriesButton platform={platform} username={username} onDone={onReload} />
				</div>
			</div>
		);
	}

	return (
		<>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
				<span className="mono muted" style={{ fontSize: 11 }}>
					{live.length} LIVE · {history.length} HISTORY · {stories.length} TOTAL
				</span>
				<FetchStoriesButton platform={platform} username={username} onDone={onReload} />
			</div>

			{live.length > 0 && (
				<div style={{ marginBottom: 16 }}>
					<div className="mono muted" style={{ fontSize: 10, letterSpacing: "0.1em", marginBottom: 8 }}>
						LIVE NOW · 24H WINDOW
					</div>
					<div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
						{live.map((s) => <StoryCard key={s.id} s={s} />)}
					</div>
				</div>
			)}

			{history.length > 0 && (
				<div>
					<div className="mono muted" style={{ fontSize: 10, letterSpacing: "0.1em", marginBottom: 8 }}>
						HISTORY · EXPIRED ON IG, ARCHIVED HERE
					</div>
					<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
						{history.map((s) => <StoryCard key={s.id} s={s} />)}
					</div>
				</div>
			)}
		</>
	);
};
