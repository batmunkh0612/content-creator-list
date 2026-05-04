import type { JobStatus } from "./use-jobs";

const STYLES: Record<JobStatus, string> = {
	pending:   "neon",
	active:    "neon",
	completed: "rising",
	failed:    "dropping",
};

export const JobStatusBadge = ({ status }: { status: JobStatus | string }) => {
	const cls = (STYLES as Record<string, string>)[status] || "stable";
	return <span className={`badge ${cls}`}>{String(status).toUpperCase()}</span>;
};
