import type { CSSProperties, ReactNode } from "react";
import { ApiError } from "@/lib/api";

export const FieldLabel = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
	<div className="mono" style={{
		fontSize: 10, color: "var(--tx-3)",
		letterSpacing: "0.1em", textTransform: "uppercase",
		marginBottom: 8,
		...style,
	}}>
		{children}
	</div>
);

export const SegRow = ({ children }: { children: ReactNode }) => (
	<div style={{
		display: "flex",
		gap: 4,
		padding: 4,
		background: "rgba(255,255,255,0.04)",
		border: "1px solid var(--line-2)",
		borderRadius: 10,
		flexWrap: "wrap",
	}}>
		{children}
	</div>
);

export const SegBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
	<button
		type="button"
		onClick={onClick}
		style={{
			flex: "1 1 0",
			minWidth: 80,
			padding: "8px 10px",
			borderRadius: 7,
			border: "none",
			cursor: "pointer",
			fontFamily: "var(--mono)",
			fontSize: 11,
			letterSpacing: "0.06em",
			textTransform: "uppercase",
			background: active
				? "linear-gradient(180deg, rgba(139,92,246,0.55), rgba(139,92,246,0.32))"
				: "transparent",
			color: active ? "#fff" : "var(--tx-2)",
			boxShadow: active ? "0 0 0 1px rgba(139,92,246,0.6), 0 0 12px rgba(139,92,246,0.3)" : "none",
			transition: "background 150ms, color 150ms",
		}}
	>
		{children}
	</button>
);

export const ResultCard = ({ heading, value, sub }: { heading: string; value: number | string; sub?: string | null }) => (
	<div className="glass" style={{
		padding: 18,
		background: "linear-gradient(180deg, rgba(34,211,238,0.08), rgba(139,92,246,0.04))",
		border: "1px solid rgba(34,211,238,0.3)",
	}}>
		<div className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
			RESULT
		</div>
		<div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
			{Number(value || 0).toLocaleString()}
			<span style={{ fontSize: 14, fontWeight: 400, color: "var(--tx-3)", marginLeft: 8 }}>{heading}</span>
		</div>
		{sub && <div className="mono" style={{ fontSize: 11, color: "var(--tx-3)", marginTop: 4 }}>{sub}</div>}
	</div>
);

const PALETTE = {
	warn: { bg: "rgba(255,181,71,0.10)", border: "rgba(255,181,71,0.35)", fg: "#ffd49a" },
	info: { bg: "rgba(34,211,238,0.10)", border: "rgba(34,211,238,0.30)", fg: "#7dd3fc" },
};

export const HeadsUp = ({ tone = "warn", children }: { tone?: keyof typeof PALETTE; children: ReactNode }) => {
	const palette = PALETTE[tone];
	return (
		<div style={{
			marginTop: 14,
			padding: "10px 14px",
			background: palette.bg,
			border: `1px solid ${palette.border}`,
			borderRadius: 10,
			color: palette.fg,
			fontSize: 12,
			lineHeight: 1.55,
			fontFamily: "var(--mono)",
		}}>
			{children}
		</div>
	);
};

export const ErrorRow = ({ err }: { err: unknown }) => {
	let msg: string;
	if (err instanceof ApiError) {
		const detail = Array.isArray(err.details) && err.details.length ? ` — ${err.details.join("; ")}` : "";
		msg = `${err.message}${detail}`;
	} else if (err instanceof Error) {
		msg = err.message;
	} else {
		msg = String(err);
	}
	return (
		<div style={{
			marginTop: 12, padding: "10px 14px",
			background: "rgba(255,84,112,0.10)",
			border: "1px solid rgba(255,84,112,0.35)",
			borderRadius: 10,
			color: "#ff8aa0",
			fontFamily: "var(--mono)", fontSize: 12,
		}}>
			{msg}
		</div>
	);
};
