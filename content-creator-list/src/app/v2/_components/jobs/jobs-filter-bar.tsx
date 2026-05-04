"use client";

import { useQueryState } from "@/lib/query-state";

const STATUS_OPTIONS: Array<{ id: string; label: string }> = [
	{ id: "",          label: "All statuses" },
	{ id: "failed",    label: "Failed" },
	{ id: "active",    label: "Active" },
	{ id: "pending",   label: "Pending" },
	{ id: "completed", label: "Completed" },
];

const KIND_OPTIONS: Array<{ id: string; label: string }> = [
	{ id: "",          label: "All kinds" },
	{ id: "scrape",    label: "Profile scrape" },
	{ id: "followers", label: "Followers fetch" },
	{ id: "following", label: "Following fetch" },
];

const selectStyle: React.CSSProperties = {
	height: 30, padding: "0 28px 0 10px",
	background: "rgba(255,255,255,0.04)",
	border: "1px solid var(--line-2)",
	borderRadius: 8, color: "var(--tx-1)",
	fontSize: 12, outline: "none",
	fontFamily: "var(--mono)",
	appearance: "none",
};

export const JobsFilterBar = ({ onRefresh }: { onRefresh: () => void }) => {
	const { get, update } = useQueryState();
	const status = get("status");
	const kind = get("kind");

	return (
		<div className="sec-actions" style={{ flexWrap: "wrap" }}>
			<select
				value={status}
				onChange={(e) => update({ status: e.target.value || null, page: null })}
				style={selectStyle}
			>
				{STATUS_OPTIONS.map((o) => <option key={o.id || "all"} value={o.id}>{o.label}</option>)}
			</select>
			<select
				value={kind}
				onChange={(e) => update({ kind: e.target.value || null, page: null })}
				style={selectStyle}
			>
				{KIND_OPTIONS.map((o) => <option key={o.id || "all"} value={o.id}>{o.label}</option>)}
			</select>
			<button className="btn btn-sm btn-ghost" onClick={onRefresh}>↻ Refresh</button>
		</div>
	);
};
