"use client";

import { useEffect, useMemo, useState } from "react";
import { influencerApi } from "@/lib/api-endpoints";
import { toV2, type V2Influencer } from "@/lib/adapter";
import { useNumberQueryParam, useQueryState } from "@/lib/query-state";

export const PAGE_SIZE = 20;
export type SortBy = "trending" | "followers" | "engagement" | "recent";

export type LeaderboardData = {
	items: V2Influencer[];
	total: number;
	offset: number;
};

const SORT_VALUES: SortBy[] = ["trending", "followers", "engagement", "recent"];

const buildParams = (
	page: number, platform: string, sortBy: SortBy,
	minF: string, maxF: string, minE: string,
) => {
	const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
	if (platform !== "all") params.platform = platform;
	if (sortBy === "followers")        { params.sortBy = "followers";      params.sortDir = "desc"; }
	else if (sortBy === "engagement")  { params.sortBy = "engagementRate"; params.sortDir = "desc"; }
	else if (sortBy === "recent")      { params.sortBy = "createdAt";      params.sortDir = "desc"; }
	else                               { params.sortBy = "followers";      params.sortDir = "desc"; }

	const minFn = parseInt(minF, 10);
	const maxFn = parseInt(maxF, 10);
	const minEn = parseFloat(minE);
	if (Number.isFinite(minFn) && minFn >= 0) params.minFollowers = minFn;
	if (Number.isFinite(maxFn) && maxFn >= 0) params.maxFollowers = maxFn;
	if (Number.isFinite(minEn) && minEn >= 0) params.engagementRate = minEn / 100;
	return params;
};

export const useLeaderboard = (platform: string) => {
	const { get, update } = useQueryState();
	const page = useNumberQueryParam("page", 0);
	const rawSort = get("sort");
	const sortBy: SortBy = (SORT_VALUES as string[]).includes(rawSort) ? (rawSort as SortBy) : "trending";
	const q = get("q");
	const minFollowers = get("minF");
	const maxFollowers = get("maxF");
	const minEngagement = get("minE");

	const [data, setData] = useState<LeaderboardData | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const [refreshNonce, setRefreshNonce] = useState(0);

	const filtersActive = !!(minFollowers || maxFollowers || minEngagement || q);
	const triggerRefresh = () => setRefreshNonce((n) => n + 1);

	const setPage = (n: number) => update({ page: n > 0 ? String(n) : null });
	const setSortBy = (s: SortBy) => update({ sort: s !== "trending" ? s : null, page: null });
	const resetFilters = () => update({ minF: null, maxF: null, minE: null, q: null, page: null });

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		const params = buildParams(page, platform, sortBy, minFollowers, maxFollowers, minEngagement);

		(influencerApi.list(params) as Promise<{ items: Parameters<typeof toV2>[0][]; total: number }>)
			.then((d) => {
				if (cancelled) return;
				const mapped = d.items.map(toV2);
				if (sortBy === "trending") mapped.sort((a, b) => b.trendingScore - a.trendingScore);
				setData({ items: mapped, total: d.total, offset: page * PAGE_SIZE });
			})
			.catch((err) => { if (!cancelled) setError(err); })
			.finally(() => { if (!cancelled) setLoading(false); });

		return () => { cancelled = true; };
	}, [platform, page, sortBy, refreshNonce, minFollowers, maxFollowers, minEngagement]);

	const filtered = useMemo(() => {
		if (!data) return [];
		const term = q.trim().toLowerCase();
		if (!term) return data.items;
		return data.items.filter(
			(i) => i.username.toLowerCase().includes(term) || (i.fullName || "").toLowerCase().includes(term)
		);
	}, [data, q]);

	const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
	const currentPage = page + 1;

	return {
		page, setPage, data, error, loading,
		sortBy, setSortBy,
		q, minFollowers, maxFollowers, minEngagement,
		filtersActive, resetFilters, triggerRefresh,
		filtered, totalPages, currentPage,
	};
};
