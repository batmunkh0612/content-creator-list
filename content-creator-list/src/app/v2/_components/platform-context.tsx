"use client";

import { useQueryState } from "@/lib/query-state";

const VALID = new Set(["all", "instagram", "tiktok", "youtube", "facebook"]);

// Platform filter lives in the URL (?platform=instagram). All filter / paging
// state is URL-backed so reload and share-by-link preserve the view.
export const usePlatform = () => {
	const { get, update } = useQueryState();
	const raw = get("platform");
	const platform = VALID.has(raw) ? raw : "all";

	// Changing platform always resets pagination, since the underlying list
	// changes shape.
	const setPlatform = (next: string) => {
		update({ platform: next === "all" ? null : next, page: null });
	};

	return { platform, setPlatform };
};
