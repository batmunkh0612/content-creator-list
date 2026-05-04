"use client";

import { useEffect, useState } from "react";
import { jobsApi } from "@/lib/api-endpoints";
import { useNumberQueryParam, useQueryState } from "@/lib/query-state";

export const PAGE_SIZE = 30;
export const POLL_MS = 5000;

export type JobStatus = "pending" | "active" | "completed" | "failed";
export type JobKind = "scrape" | "followers" | "following";

export type Job = {
	id: string;
	platform: string;
	username: string;
	status: JobStatus;
	kind: JobKind;
	attempts: number;
	error?: string | null;
	jobId?: string | null;
	createdAt: string;
	completedAt?: string | null;
};

type Resp = { items: Job[]; total: number; limit: number; offset: number };

const ACTIVE_SET = new Set(["pending", "active"]);

export const useJobs = () => {
	const { get, update } = useQueryState();
	const page = useNumberQueryParam("page", 0);
	const status = get("status");
	const kind = get("kind");
	const platform = get("platform");
	const username = get("username");

	const [data, setData] = useState<Resp | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const [nonce, setNonce] = useState(0);

	const refresh = () => setNonce((n) => n + 1);

	const setPage = (n: number) => update({ page: n > 0 ? String(n) : null });

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
		if (status)   params.status   = status;
		if (kind)     params.kind     = kind;
		if (platform) params.platform = platform;
		if (username) params.username = username;

		(jobsApi.list(params) as Promise<Resp>)
			.then((d) => { if (!cancelled) setData(d); })
			.catch((err) => { if (!cancelled) setError(err); })
			.finally(() => { if (!cancelled) setLoading(false); });

		return () => { cancelled = true; };
	}, [page, status, kind, platform, username, nonce]);

	// While any visible job is still in flight, poll on a timer so the table
	// reflects status transitions without the user hitting refresh.
	useEffect(() => {
		if (!data?.items?.some((j) => ACTIVE_SET.has(j.status))) return;
		const id = setTimeout(refresh, POLL_MS);
		return () => clearTimeout(id);
	}, [data]);

	const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

	return {
		data, error, loading, page, setPage, totalPages,
		status, kind, platform, username,
		refresh,
	};
};
