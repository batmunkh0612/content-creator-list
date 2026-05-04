const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const exact = new Intl.NumberFormat("en-US");

export const fmtCount = (n: number | null | undefined) => {
	if (n === null || n === undefined) return "—";
	return compact.format(Number(n));
};

export const fmtCountExact = (n: number | null | undefined) => {
	if (n === null || n === undefined) return "—";
	return exact.format(Number(n));
};

export const fmtPercent = (rate: number | null | undefined) => {
	if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return "—";
	return `${(Number(rate) * 100).toFixed(2)}%`;
};

export const fmtDate = (value: string | Date | null | undefined) => {
	if (!value) return "—";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export const fmtRelative = (value: string | Date | null | undefined) => {
	if (!value) return "—";
	const d = new Date(value);
	const diffSec = (Date.now() - d.getTime()) / 1000;
	if (diffSec < 60) return "just now";
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
	if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
	if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
	return fmtDate(value);
};

export const compactNum = (n: number | null | undefined, exactOut = false): string => {
	if (n === null || n === undefined || Number.isNaN(n)) return "—";
	if (exactOut) return Number(n).toLocaleString();
	const v = Number(n);
	if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
	if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
	if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
	return String(v);
};

export const fmtPct = (n: number | null | undefined, d = 1): string =>
	n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(d)}%`;

export const fmtRel = (d: string | Date | null | undefined): string => {
	if (!d) return "—";
	const ms = Date.now() - new Date(d).getTime();
	const s = Math.floor(ms / 1000);
	if (s < 60)    return `${s}s ago`;
	if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
};

export const fmtRelDate = (d: string | Date | null | undefined): string => {
	if (!d) return "—";
	const ms = Date.now() - new Date(d).getTime();
	const days = Math.floor(ms / 86_400_000);
	if (days < 1)   return "today";
	if (days === 1) return "1d";
	if (days < 30)  return `${days}d`;
	if (days < 365) return `${Math.floor(days / 30)}mo`;
	return `${Math.floor(days / 365)}y`;
};
