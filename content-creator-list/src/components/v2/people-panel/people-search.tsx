"use client";

import { useDebouncedQueryParam } from "@/lib/query-state";
import { Icon } from "../icon";

// Search input bound to ?q=… via the debounced URL hook. Shared by the
// followers and following tabs (only one mounts at a time).
export const PeopleSearch = ({ kind }: { kind: "followers" | "following" }) => {
	const [value, setValue] = useDebouncedQueryParam("q");
	return (
		<div style={{ marginBottom: 14, position: "relative", maxWidth: 360 }}>
			<span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tx-3)" }}>
				<Icon name="search" size={14} />
			</span>
			<input
				type="search"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder={`Search ${kind}…`}
				style={{
					width: "100%", height: 36,
					padding: "0 12px 0 36px",
					background: "rgba(255,255,255,0.04)",
					border: "1px solid var(--line-2)",
					borderRadius: 10, color: "var(--tx-1)",
					fontSize: 13, outline: "none",
				}}
			/>
		</div>
	);
};
