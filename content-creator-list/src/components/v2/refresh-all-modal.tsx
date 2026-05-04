"use client";

import { useState } from "react";
import { scrapeApi } from "@/lib/api-endpoints";
import { Modal } from "./modal";
import { FieldLabel, SegRow, SegBtn, ResultCard, HeadsUp, ErrorRow } from "./modal-bits";

const STALENESS = [
	{ hours: 0,          label: "EVERYONE" },
	{ hours: 1,          label: "> 1 HOUR" },
	{ hours: 24,         label: "> 24 HOURS" },
	{ hours: 24 * 7,     label: "> 7 DAYS" },
];

const PLATFORMS = [
	{ id: "",          label: "ALL" },
	{ id: "instagram", label: "Instagram" },
	{ id: "tiktok",    label: "TikTok" },
	{ id: "youtube",   label: "YouTube" },
	{ id: "facebook",  label: "Facebook" },
];

type Resp = { enqueued: number; total?: number; breakdown?: Record<string, number> };

type Props = {
	defaultPlatform?: string;
	onClose: () => void;
	onDone?: (r: Resp) => void;
};

export const RefreshAllModal = ({ defaultPlatform = "", onClose, onDone }: Props) => {
	const [platform, setPlatform] = useState(defaultPlatform);
	const [olderThanHours, setOlder] = useState(0);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const [result, setResult] = useState<Resp | null>(null);

	const submit = async () => {
		setSubmitting(true);
		setError(null);
		try {
			const r = (await scrapeApi.refreshAll({
				platform: platform || undefined,
				olderThanHours,
			})) as Resp;
			setResult(r);
			onDone?.(r);
		} catch (err) {
			setError(err);
		} finally {
			setSubmitting(false);
		}
	};

	const breakdownEntries = Object.entries(result?.breakdown || {});

	return (
		<Modal open onClose={onClose} eyebrow="—" title="RE-SCRAPE TRACKED PROFILES" width={620}>
			{!result ? (
				<>
					<p className="mono" style={{ fontSize: 12, color: "var(--tx-3)", marginTop: 0 }}>
						Enqueues a fresh scrape per matching profile. Existing rows are upserted; no duplicates.
					</p>

					<FieldLabel style={{ marginTop: 14 }}>PLATFORM</FieldLabel>
					<SegRow>
						{PLATFORMS.map((p) => (
							<SegBtn key={p.id || "all"} active={platform === p.id} onClick={() => setPlatform(p.id)}>{p.label}</SegBtn>
						))}
					</SegRow>

					<FieldLabel style={{ marginTop: 14 }}>
						STALENESS <span style={{ color: "var(--tx-4)" }}>· ONLY REFRESH IF LAST SCRAPE WAS</span>
					</FieldLabel>
					<SegRow>
						{STALENESS.map((s) => (
							<SegBtn key={s.hours} active={olderThanHours === s.hours} onClick={() => setOlder(s.hours)}>{s.label}</SegBtn>
						))}
					</SegRow>

					<HeadsUp tone="warn">
						<strong>HEADS UP</strong> · cap 1000 per click · default concurrency (2) ≈ 8–15 min per 100 jobs
					</HeadsUp>

					{error ? <ErrorRow err={error} /> : null}

					<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
						<button onClick={onClose} disabled={submitting} className="btn btn-sm btn-ghost">CANCEL</button>
						<button onClick={submit} disabled={submitting} className="btn btn-sm btn-primary">
							{submitting ? "QUEUING…" : platform ? `RE-SCRAPE ALL ${platform.toUpperCase()}` : "RE-SCRAPE ALL"}
						</button>
					</div>
				</>
			) : (
				<>
					<ResultCard
						heading="ENQUEUED"
						value={result.enqueued}
						sub={`OF ${Number(result.total || 0).toLocaleString()} MATCHING`}
					/>
					{breakdownEntries.length > 0 && (
						<div style={{
							display: "grid",
							gridTemplateColumns: `repeat(${breakdownEntries.length}, 1fr)`,
							gap: 0, marginTop: 12,
							border: "1px solid var(--line-2)", borderRadius: 10, overflow: "hidden",
						}}>
							{breakdownEntries.map(([p, n], i, arr) => (
								<div key={p} style={{
									padding: 12,
									borderRight: i < arr.length - 1 ? "1px solid var(--line-1)" : "none",
									background: "rgba(255,255,255,0.02)",
								}}>
									<div className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{p}</div>
									<div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
										{Number(n).toLocaleString()}
									</div>
								</div>
							))}
						</div>
					)}
					<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
						<button onClick={onClose} className="btn btn-sm btn-primary">DONE</button>
					</div>
				</>
			)}
		</Modal>
	);
};
