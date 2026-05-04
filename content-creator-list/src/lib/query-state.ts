"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Source-of-truth for filter + pagination state lives in the URL so refresh
// and share-by-link both work. router.replace keeps the back/forward stack
// quiet — we don't want every keystroke to push history.
export const useQueryState = () => {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const get = useCallback(
		(key: string) => searchParams.get(key) || "",
		[searchParams]
	);

	const update = useCallback(
		(patch: Record<string, string | null | undefined>) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [k, v] of Object.entries(patch)) {
				if (v == null || v === "") params.delete(k);
				else params.set(k, v);
			}
			const qs = params.toString();
			router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
		},
		[router, pathname, searchParams]
	);

	return { get, update, searchParams };
};

// Mirror of a URL param into local state for snappy typing, with a debounced
// writer back to the URL. Always clears `page` when the param changes —
// pagination has to reset whenever the underlying filter does.
export const useDebouncedQueryParam = (
	key: string,
	delay = 250
): [string, (v: string) => void] => {
	const { get, update } = useQueryState();
	const urlValue = get(key);
	const [local, setLocal] = useState(urlValue);

	// External URL changes (eg. reset button) should pull into local state.
	useEffect(() => { setLocal(urlValue); }, [urlValue]);

	// Local typing pushes back to the URL after `delay` ms.
	useEffect(() => {
		if (local === urlValue) return;
		const id = setTimeout(() => {
			update({ [key]: local || null, page: null });
		}, delay);
		return () => clearTimeout(id);
	}, [local, urlValue, update, key, delay]);

	return [local, setLocal];
};

// Numeric param read with a default, so callers don't have to NaN-guard.
export const useNumberQueryParam = (key: string, defaultValue: number): number => {
	const { searchParams } = useQueryState();
	return useMemo(() => {
		const raw = searchParams.get(key);
		if (raw === null) return defaultValue;
		const n = Number(raw);
		return Number.isFinite(n) ? n : defaultValue;
	}, [searchParams, key, defaultValue]);
};
