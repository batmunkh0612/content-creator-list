"use client";

import { useState } from "react";
import { scrapeApi } from "@/lib/api-endpoints";
import { Modal } from "./modal";
import { FieldLabel, SegRow, SegBtn, ResultCard, HeadsUp, ErrorRow } from "./modal-bits";

const STALENESS = [
	{ hours: 0,      label: "EVERYONE" },
	{ hours: 24,     label: "> 24 HOURS" },
	{ hours: 24 * 7, label: "> 7 DAYS" },
	{ hours: -1,     label: "NEVER FETCHED", onlyMissing: true },
];

type Resp = { enqueued: number; total?: number; perProfileMax?: number; note?: string };

type Props = {
	totalProfiles?: number;
	kind?: "followers" | "following";
	onClose: () => void;
	onDone?: (r: Resp) => void;
};

export const RefreshAllFollowersModal = ({
	totalProfiles = 0,
	kind = "followers",
	onClose,
	onDone,
}: Props) => {
	const [filter, setFilter] = useState<{ hours: number; onlyMissing?: boolean }>({ hours: 0 });
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const [result, setResult] = useState<Resp | null>(null);

	const isFollowers = kind === "followers";
	const labels = isFollowers
		? { title: "FETCH ALL FOLLOWERS · INSTAGRAM", table: "followers", word: "follower" }
		: { title: "FETCH ALL FOLLOWING · INSTAGRAM", table: "following", word: "following" };

	const submit = async () => {
		setSubmitting(true);
		setError(null);
		try {
			const fn = isFollowers ? scrapeApi.refreshAllFollowers : scrapeApi.refreshAllFollowing;
			const r = (await fn({
				olderThanHours: filter.onlyMissing ? 0 : filter.hours,
				onlyMissing: !!filter.onlyMissing,
			})) as Resp;
			setResult(r);
			onDone?.(r);
		} catch (err) {
			setError(err);
		} finally {
			setSubmitting(false);
		}
	};

	const minutesEstimate = Math.ceil((totalProfiles * 6) / 60);

	return (
		<Modal open onClose={onClose} eyebrow="—" title={labels.title} width={620}>
			{!result ? (
				<>
					<p className="mono" style={{ fontSize: 12, color: "var(--tx-3)", marginTop: 0, lineHeight: 1.55 }}>
						Enqueues a {labels.word}-list fetch per Instagram profile. Persists to the{" "}
						<code style={{ color: "var(--tx-1)", padding: "0 4px" }}>{labels.table}</code> table; safe to re-run.
					</p>

					<FieldLabel style={{ marginTop: 14 }}>SCOPE</FieldLabel>
					<SegRow>
						{STALENESS.map((o) => {
							const active =
								(o.onlyMissing && filter.onlyMissing) ||
								(!o.onlyMissing && !filter.onlyMissing && filter.hours === o.hours);
							return (
								<SegBtn
									key={o.label}
									active={active}
									onClick={() => setFilter({ hours: o.hours, onlyMissing: o.onlyMissing })}
								>
									{o.label}
								</SegBtn>
							);
						})}
					</SegRow>

					{isFollowers ? (
						<HeadsUp tone="warn">
							<strong>IG VISIBILITY CAP</strong>
							<ul style={{ margin: "6px 0 0 18px", paddingLeft: 0, lineHeight: 1.6 }}>
								<li>For accounts the session does <strong>not follow</strong>, IG returns ~40 followers per profile.</li>
								<li>Approx <span style={{ fontVariantNumeric: "tabular-nums" }}>40 × {totalProfiles.toLocaleString()} ≈ {(totalProfiles * 40).toLocaleString()}</span> rows total.</li>
								<li>Per-profile fetch ≈ 5–8s with jitter. Total ≈ <span style={{ fontVariantNumeric: "tabular-nums" }}>{minutesEstimate} min</span> at concurrency=2.</li>
							</ul>
						</HeadsUp>
					) : (
						<HeadsUp tone="info">
							<strong>HEADS UP</strong>
							<ul style={{ margin: "6px 0 0 18px", paddingLeft: 0, lineHeight: 1.6 }}>
								<li>Following lists are <strong>more complete</strong> than follower lists — IG treats them as public-by-default.</li>
								<li>Approx capture is whatever each profile follows, capped at the global cap (10K default).</li>
								<li>Per-profile fetch ≈ 5–8s with jitter. Total ≈ <span style={{ fontVariantNumeric: "tabular-nums" }}>{minutesEstimate} min</span> at concurrency=2.</li>
							</ul>
						</HeadsUp>
					)}

					{error ? <ErrorRow err={error} /> : null}

					<div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
						<button onClick={onClose} disabled={submitting} className="btn btn-sm btn-ghost">CANCEL</button>
						<button onClick={submit} disabled={submitting} className="btn btn-sm btn-primary">
							{submitting ? "QUEUING…" : "ENQUEUE FOR ALL"}
						</button>
					</div>
				</>
			) : (
				<>
					<ResultCard
						heading="ENQUEUED"
						value={result.enqueued}
						sub={`OF ${Number(result.total || 0).toLocaleString()} MATCHING · CAP ${Number(result.perProfileMax || 0).toLocaleString()} EACH`}
					/>
					{result.note && (
						<p className="mono" style={{ marginTop: 12, fontSize: 11, color: "var(--tx-3)", lineHeight: 1.55 }}>{result.note}</p>
					)}
					<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
						<button onClick={onClose} className="btn btn-sm btn-primary">DONE</button>
					</div>
				</>
			)}
		</Modal>
	);
};
