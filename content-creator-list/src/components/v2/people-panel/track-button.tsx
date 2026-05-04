"use client";

import { useState } from "react";
import { scrapeApi } from "@/lib/api-endpoints";

type TrackState = "idle" | "queueing" | "queued" | "error";

const bg = (s: TrackState) =>
	s === "queued" ? "rgba(34,211,238,0.85)" :
	s === "error"  ? "rgba(255,84,112,0.85)" : "rgba(11,11,18,0.72)";

const border = (s: TrackState) =>
	s === "queued" ? "1px solid rgba(34,211,238,0.7)" :
	s === "error"  ? "1px solid rgba(255,84,112,0.7)" : "1px solid rgba(139,92,246,0.55)";

const color = (s: TrackState) =>
	s === "queued" ? "#0b0b12" : s === "error" ? "#fff" : "#c4b5ff";

const labelFor = (s: TrackState) =>
	s === "idle"     ? "+ SCRAPE" :
	s === "queueing" ? "…QUEUING" :
	s === "queued"   ? "✓ QUEUED" : "! RETRY";

type Props = { username: string; onScraped?: () => void };

export const TrackButton = ({ username, onScraped }: Props) => {
	const [state, setState] = useState<TrackState>("idle");

	const handle = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (state === "queueing" || state === "queued") return;
		setState("queueing");
		try {
			await scrapeApi.enqueue("instagram", username);
			setState("queued");
			setTimeout(() => { try { onScraped?.(); } catch {} }, 6000);
		} catch {
			setState("error");
		}
	};

	return (
		<button
			onClick={handle}
			disabled={state === "queueing" || state === "queued"}
			style={{
				position: "absolute", top: 8, left: 8,
				display: "inline-flex", alignItems: "center", gap: 4,
				background: bg(state),
				backdropFilter: "blur(6px)",
				border: border(state),
				borderRadius: 999, padding: "3px 9px",
				fontSize: 9, fontFamily: "var(--mono)",
				fontWeight: 600, letterSpacing: "0.08em",
				color: color(state),
				cursor: state === "queueing" ? "wait" : state === "queued" ? "default" : "pointer",
				boxShadow: state === "idle" ? "0 0 12px rgba(139,92,246,0.18)" : "none",
				textTransform: "uppercase",
				transition: "background 150ms ease, border-color 150ms ease",
			}}
		>
			{labelFor(state)}
		</button>
	);
};
