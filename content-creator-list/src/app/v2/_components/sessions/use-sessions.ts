"use client";

import { useEffect, useState } from "react";
import { sessionsApi } from "@/lib/api-endpoints";

export type IgSession = {
	id: string;
	label: string | null;
	sessionid: string | null;       // masked
	dsUserId: string | null;
	cookies: string | null;          // masked
	wwwClaim: string | null;         // masked
	enabled: boolean;
	cold: boolean;
	cooldownEndsAt: string | null;
	lastUsedAt: string | null;
	hasFullJar: boolean;
	inPool: boolean;
	createdAt: string;
	updatedAt: string;
};

type Resp = { items: IgSession[]; lastLoadedAt: string };

const REFRESH_MS = 8000;

export const useSessions = () => {
	const [data, setData] = useState<Resp | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const [nonce, setNonce] = useState(0);

	const refresh = () => setNonce((n) => n + 1);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		(sessionsApi.list() as Promise<Resp>)
			.then((d) => { if (!cancelled) setData(d); })
			.catch((err) => { if (!cancelled) setError(err); })
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [nonce]);

	// Auto-refresh so the cold/warm state stays current as the worker updates
	// the DB. Keep it gentle — sessions don't change often.
	useEffect(() => {
		const id = setInterval(refresh, REFRESH_MS);
		return () => clearInterval(id);
	}, []);

	return { data, error, loading, refresh };
};
