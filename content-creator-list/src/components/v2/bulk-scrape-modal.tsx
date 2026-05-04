"use client";

import { useMemo, useState } from "react";
import { scrapeApi } from "@/lib/api-endpoints";
import { Modal } from "./modal";
import { FieldLabel, SegRow, SegBtn, ResultCard, ErrorRow } from "./modal-bits";

const MAX_PER_BATCH = 500;
const PLATFORMS = [
	{ id: "instagram", label: "Instagram" },
	{ id: "tiktok",    label: "TikTok" },
	{ id: "youtube",   label: "YouTube" },
	{ id: "facebook",  label: "Facebook" },
];

type BulkResp = { enqueued: number; skipped?: Array<{ username?: string; reason: string }> };

const parseHandles = (text: string): string[] => {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const line of text.split(/[\n,]/)) {
		const cleaned = line.trim().replace(/^@/, "");
		if (cleaned && !seen.has(cleaned)) { seen.add(cleaned); out.push(cleaned); }
	}
	return out;
};

type Props = { onClose: () => void; onDone?: (r: BulkResp) => void };

export const BulkScrapeModal = ({ onClose, onDone }: Props) => {
	const [platform, setPlatform] = useState("instagram");
	const [text, setText] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<BulkResp | null>(null);
	const [error, setError] = useState<unknown>(null);

	const handles = useMemo(() => parseHandles(text), [text]);
	const overLimit = handles.length > MAX_PER_BATCH;

	const submit = async () => {
		if (!handles.length || overLimit) return;
		setSubmitting(true);
		setError(null);
		try {
			const r = (await scrapeApi.bulk({ platform, usernames: handles })) as BulkResp;
			setResult(r);
			onDone?.(r);
		} catch (err) {
			setError(err);
		} finally {
			setSubmitting(false);
		}
	};

	const reset = () => { setText(""); setResult(null); setError(null); };

	return (
		<Modal open onClose={onClose} eyebrow="—" title="BULK IMPORT" width={640}>
			{!result ? (
				<>
					<FieldLabel>PLATFORM</FieldLabel>
					<SegRow>
						{PLATFORMS.map((p) => (
							<SegBtn key={p.id} active={platform === p.id} onClick={() => setPlatform(p.id)}>{p.label}</SegBtn>
						))}
					</SegRow>

					<FieldLabel style={{ marginTop: 14 }}>
						HANDLES <span style={{ color: "var(--tx-4)" }}>· ONE PER LINE OR COMMA-SEPARATED</span>
					</FieldLabel>
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						rows={11}
						spellCheck={false}
						autoFocus
						placeholder={"odzayaa\n@anotherone\nhttps://www.instagram.com/one_more/\n…"}
						style={{
							width: "100%", padding: "10px 12px",
							background: "rgba(255,255,255,0.04)",
							border: "1px solid var(--line-2)",
							borderRadius: 10, color: "var(--tx-1)",
							fontSize: 13, fontFamily: "var(--mono)",
							resize: "vertical", outline: "none", minHeight: 200,
						}}
					/>

					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12, flexWrap: "wrap" }}>
						<div className="mono" style={{ fontSize: 12, color: "var(--tx-3)" }}>
							<span style={{ color: overLimit ? "#ff8aa0" : "var(--tx-1)", fontWeight: 700 }}>{handles.length}</span>
							{" "}UNIQUE HANDLES
							{overLimit && <span style={{ color: "#ff8aa0", marginLeft: 6 }}>· EXCEEDS {MAX_PER_BATCH}</span>}
						</div>
						<div style={{ display: "flex", gap: 8 }}>
							<button onClick={onClose} disabled={submitting} className="btn btn-sm btn-ghost">CANCEL</button>
							<button onClick={submit} disabled={submitting || !handles.length || overLimit} className="btn btn-sm btn-primary">
								{submitting ? "QUEUING…" : `ENQUEUE ${handles.length}`}
							</button>
						</div>
					</div>

					{error ? <ErrorRow err={error} /> : null}
				</>
			) : (
				<>
					<ResultCard
						heading="ENQUEUED"
						value={result.enqueued}
						sub={result.skipped?.length ? `· ${result.skipped.length} skipped` : null}
					/>
					{result.skipped?.length ? (
						<div className="glass" style={{ marginTop: 12, padding: 14 }}>
							<div className="mono" style={{ fontSize: 10, color: "#ffd49a", letterSpacing: "0.1em", textTransform: "uppercase" }}>
								SKIPPED · {result.skipped.length}
							</div>
							<ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontFamily: "var(--mono)", fontSize: 11, color: "var(--tx-2)", maxHeight: 180, overflowY: "auto" }}>
								{result.skipped.map((s, i) => (
									<li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--line-1)" }}>
										<span>{s.username || "(empty)"}</span>
										<span style={{ color: "var(--tx-3)" }}>{s.reason}</span>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
						<button onClick={reset} className="btn btn-sm btn-ghost">ANOTHER BATCH</button>
						<button onClick={onClose} className="btn btn-sm btn-primary">DONE</button>
					</div>
				</>
			)}
		</Modal>
	);
};
