"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { influencerApi, scrapeApi } from "@/lib/api-endpoints";
import { useNumberQueryParam, useQueryState } from "@/lib/query-state";

export const PAGE_SIZE = 60;
export const POLL_MS = 2500;
export const TERMINAL = new Set(["completed", "failed"]);

// Per-click batch size sent as the `max` param to the backend. Followers use
// a small batch since IG's anonymous-visibility cap means clicks above ~40
// often return diminishing results — clicking again upserts the next batch.
// Following lists are public-by-default so we can pull a much larger chunk
// per click.
export const FOLLOWERS_BATCH = 20;
export const FOLLOWING_BATCH = 400;

export type PeopleKind = "followers" | "following";

export type Person = {
	username: string;
	fullName?: string | null;
	profilePicUrl?: string | null;
	isVerified?: boolean;
	isPrivate?: boolean;
	tracked?: boolean;
	followersCount?: number | null;
	postsCount?: number | null;
	engagementRate?: number | null;
};

export type PanelData = {
	items: Person[];
	total: number;
	offset: number;
	influencer?: Record<string, unknown>;
};

export type PanelJob = { jobId: string; status: string; error?: string };

type Args = { kind: PeopleKind; platform: string; username: string };

export const usePeopleData = ({ kind, platform, username }: Args) => {
	const isFollowers = kind === "followers";
	const { get, update } = useQueryState();
	const page = useNumberQueryParam("page", 0);
	const q = get("q");

	const [data, setData] = useState<PanelData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<unknown>(null);
	const [job, setJob] = useState<PanelJob | null>(null);
	const [scrapeError, setScrapeError] = useState<unknown>(null);
	const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const setPage = (n: number) => update({ page: n > 0 ? String(n) : null });

	const load = async () => {
		setLoading(true);
		setError(null);
		try {
			const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
			if (q) params.q = q;
			const fetcher = isFollowers ? influencerApi.followers : influencerApi.following;
			const d = (await fetcher(platform, username, params)) as PanelData;
			setData(d);
		} catch (err) {
			if (err instanceof ApiError && err.status === 404) {
				setData({ items: [], total: 0, offset: 0 });
			} else {
				setError(err);
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [platform, username, page, q, kind]);

	useEffect(() => {
		if (!job?.jobId) return;
		if (TERMINAL.has(job.status)) { load(); return; }
		pollTimer.current = setTimeout(async () => {
			try {
				const updated = (await scrapeApi.job(job.jobId)) as { status: string; error?: string };
				setJob({ ...updated, jobId: job.jobId });
				load();
			} catch (err) {
				setScrapeError(err);
			}
		}, POLL_MS);
		return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [job]);

	const batchSize = isFollowers ? FOLLOWERS_BATCH : FOLLOWING_BATCH;

	const triggerFetch = async () => {
		setScrapeError(null);
		try {
			const fn = isFollowers ? scrapeApi.fetchFollowers : scrapeApi.fetchFollowing;
			const res = (await fn(platform, username, batchSize)) as PanelJob;
			setJob({ jobId: res.jobId, status: res.status });
		} catch (err) {
			setScrapeError(err);
		}
	};

	return {
		data, loading, error, page, setPage, q,
		job, scrapeError, triggerFetch, reload: load, isFollowers, batchSize,
	};
};
