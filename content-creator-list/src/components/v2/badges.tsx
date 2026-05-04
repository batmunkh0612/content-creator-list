import type { V2Status } from "@/lib/adapter";

export const StatusBadge = ({ status }: { status: V2Status | string }) => {
	if (status === "rising")   return <span className="badge rising">🚀 Rising</span>;
	if (status === "viral")    return <span className="badge viral">🔥 Viral</span>;
	if (status === "dropping") return <span className="badge dropping">⚠ Dropping</span>;
	return <span className="badge stable">— Stable</span>;
};

const LABELS: Record<string, string> = {
	tiktok: "TikTok",
	instagram: "Instagram",
	youtube: "YouTube",
	facebook: "Facebook",
};

const ICONS: Record<string, React.ReactElement> = {
	tiktok: (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
			<path d="M16 2v3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.3V16a6 6 0 1 1-6-6c.4 0 .7 0 1 .1V13a3 3 0 1 0 2 2.8V2z" />
		</svg>
	),
	instagram: (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="3" y="3" width="18" height="18" rx="5" />
			<circle cx="12" cy="12" r="4" />
			<circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
		</svg>
	),
	youtube: (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
			<path d="M23 7s-.2-1.6-.9-2.3c-.8-.9-1.7-.9-2.2-1C16.5 3.5 12 3.5 12 3.5s-4.5 0-7.9.3c-.5 0-1.4 0-2.2 1C1.2 5.4 1 7 1 7s-.2 1.9-.2 3.7v1.7C.8 14.1 1 16 1 16s.2 1.6.9 2.3c.8.9 1.9.9 2.4 1 1.7.2 7.7.3 7.7.3s4.5 0 7.9-.3c.5-.1 1.4-.1 2.2-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.7v-1.7C23.2 8.9 23 7 23 7zM9.7 14.3V8.1l5.8 3.1z" />
		</svg>
	),
	facebook: (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
			<path d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.88V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z" />
		</svg>
	),
};

export const PlatformPill = ({ platform }: { platform: string }) => {
	const cls =
		platform === "tiktok"    ? "tt" :
		platform === "instagram" ? "ig" :
		platform === "youtube"   ? "yt" : "fb";
	return (
		<span className={`platform-pill ${cls}`}>
			{ICONS[platform]} {LABELS[platform] || platform}
		</span>
	);
};
