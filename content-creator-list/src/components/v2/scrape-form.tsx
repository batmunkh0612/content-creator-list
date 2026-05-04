"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { scrapeApi } from "@/lib/api-endpoints";
import { parseHandle } from "@/lib/parse-handle";
import { usePlatform } from "@/app/v2/_components/platform-context";
import { Icon } from "./icon";
import { ErrorRow } from "./error-row";

const PLATFORM_OPTIONS = [
	{ id: "instagram", short: "IG", label: "Instagram", cls: "ig" },
	{ id: "tiktok",    short: "TT", label: "TikTok",    cls: "tt" },
	{ id: "youtube",   short: "YT", label: "YouTube",   cls: "yt" },
	{ id: "facebook",  short: "FB", label: "Facebook",  cls: "fb" },
];

type Props = {
	onEnqueued?: (res: unknown) => void;
	navigateOnSuccess?: boolean;
	autoFocus?: boolean;
};

type EnqueueResp = { jobId?: string; status?: string };

const PLACEHOLDERS: Record<string, string> = {
	instagram: "@handle, instagram.com/<handle>, or paste full URL",
	tiktok:    "@handle, tiktok.com/@<handle>, or paste full URL",
	youtube:   "@handle, channel/UC…, or paste youtube.com/@<handle> URL",
	facebook:  "page slug, facebook.com/<slug>, or paste full URL",
};

export const ScrapeForm = ({ onEnqueued, navigateOnSuccess = true, autoFocus = false }: Props) => {
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const { platform: ctxPlatform } = usePlatform();

	// Default the picker to the platform the user is currently filtering by.
	// "all" falls back to Instagram so first-time users see something sensible.
	const initialPicker = ctxPlatform === "all" ? "instagram" : ctxPlatform;
	const [pickerPlatform, setPickerPlatform] = useState(initialPicker);
	const [input, setInput] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const [last, setLast] = useState<{ jobId?: string; platform: string; username: string } | null>(null);

	// Follow context changes — e.g. user clicks the YouTube tab while the
	// form is mounted; the picker should snap to YT so the next paste
	// targets the right platform.
	useEffect(() => {
		if (ctxPlatform !== "all") setPickerPlatform(ctxPlatform);
	}, [ctxPlatform]);

	useEffect(() => {
		if (autoFocus) inputRef.current?.focus();
	}, [autoFocus]);

	const parsed = useMemo(() => parseHandle(input, pickerPlatform), [input, pickerPlatform]);
	const previewOk = !!parsed && !parsed.error && !!parsed.username;
	const platformBadgeCls = previewOk
		? PLATFORM_OPTIONS.find((p) => p.id === parsed!.platform)?.cls ?? ""
		: "";

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLast(null);
		if (!parsed) return;
		if (parsed.error) { setError(new Error(parsed.error)); return; }
		setSubmitting(true);
		try {
			const res = (await scrapeApi.enqueue(parsed.platform!, parsed.username!)) as EnqueueResp;
			setLast({ ...res, platform: parsed.platform!, username: parsed.username! });
			setInput("");
			onEnqueued?.(res);
			if (navigateOnSuccess) {
				router.push(`/v2/influencers/${parsed.platform}/${parsed.username}`);
			}
		} catch (err) {
			setError(err);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			{/* Platform picker — visible pills. The active one drives the
			    placeholder + the parse default for bare handles. */}
			<div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
				<span className="mono muted" style={{ fontSize: 10, letterSpacing: "0.1em", marginRight: 4 }}>
					PLATFORM
				</span>
				{PLATFORM_OPTIONS.map((p) => {
					const active = pickerPlatform === p.id;
					return (
						<button
							key={p.id}
							type="button"
							onClick={() => setPickerPlatform(p.id)}
							className={`platform-pill ${p.cls}`}
							style={{
								cursor: "pointer",
								opacity: active ? 1 : 0.45,
								outline: active ? "1px solid rgba(255,255,255,0.45)" : "none",
								outlineOffset: 1,
								// Slight scale so the active pill feels primary.
								transform: active ? "scale(1.02)" : "none",
								transition: "opacity 120ms ease, transform 120ms ease",
							}}
							title={`Scrape a ${p.label} profile`}
						>
							{p.short} · {p.label}
						</button>
					);
				})}
			</div>

			<div className="glass" style={{ display: "flex", alignItems: "stretch", padding: 0, overflow: "hidden", height: 44 }}>
				<input
					ref={inputRef}
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={PLACEHOLDERS[pickerPlatform]}
					autoComplete="off"
					spellCheck={false}
					style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--tx-1)", fontSize: 14, padding: "0 14px", fontFamily: "inherit" }}
				/>
				{previewOk && (
					<div style={{ display: "flex", alignItems: "center", padding: "0 10px", borderLeft: "1px solid var(--line-2)" }}>
						<span className={`platform-pill ${platformBadgeCls}`}>{parsed!.platform} · @{parsed!.username}</span>
					</div>
				)}
				<button type="submit" disabled={submitting || !previewOk} className="btn btn-primary" style={{ margin: 0, borderRadius: 0, borderLeft: "1px solid var(--line-2)", minWidth: 110, opacity: previewOk ? 1 : 0.5 }}>
					{submitting ? "QUEUING…" : <>SCRAPE <Icon name="arrow" size={13} /></>}
				</button>
			</div>

			{input && parsed?.error && !error && (
				<div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", padding: "4px 12px" }}>
					⚠ {parsed.error}
				</div>
			)}

			{error ? <ErrorRow err={error} /> : null}

			{last && !error && (
				<div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", padding: "6px 12px", background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.25)", borderRadius: 8 }}>
					✓ queued {last.platform.toUpperCase()} · @{last.username}
					{last.jobId && <span style={{ color: "var(--tx-4)" }}> · job {String(last.jobId).slice(0, 18)}…</span>}
					{" "}
					<a
						href={`/v2/influencers/${last.platform}/${last.username}`}
						style={{ color: "var(--accent-1)", textDecoration: "underline" }}
					>
						open profile →
					</a>
				</div>
			)}
		</form>
	);
};
