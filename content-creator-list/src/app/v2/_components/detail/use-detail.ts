"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { influencerApi, scrapeApi } from "@/lib/api-endpoints";
import { toV2, type V2Influencer } from "@/lib/adapter";

export const POLL_MS = 2000;
export const TERMINAL = new Set(["completed", "failed"]);

export type DetailJob = { jobId: string; status: string; error?: string };

export type RawProfile = Parameters<typeof toV2>[0] & {
	posts?: Array<Record<string, unknown>>;
};

type Args = { platform: string; username: string };

export const useDetail = ({ platform, username }: Args) => {
	const [inf, setInf] = useState<V2Influencer | null>(null);
	const [raw, setRaw] = useState<RawProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<unknown>(null);
	const [notFound, setNotFound] = useState(false);
	const [job, setJob] = useState<DetailJob | null>(null);
	const [jobError, setJobError] = useState<unknown>(null);
	const [reloadNonce, setReloadNonce] = useState(0);
	const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		setNotFound(false);
		influencerApi.get(platform, username)
			.then((d) => {
				if (cancelled) return;
				const profile = d as RawProfile;
				setRaw(profile);
				setInf(toV2(profile));
			})
			.catch((err) => {
				if (cancelled) return;
				if (err instanceof ApiError && err.status === 404) setNotFound(true);
				else setError(err);
			})
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [platform, username, reloadNonce]);

	useEffect(() => {
		if (!job?.jobId || TERMINAL.has(job.status)) return;
		pollTimer.current = setTimeout(async () => {
			try {
				const updated = (await scrapeApi.job(job.jobId)) as DetailJob;
				setJob({ ...updated, jobId: job.jobId });
				if (TERMINAL.has(updated.status)) setReloadNonce((n) => n + 1);
			} catch (err) {
				setJobError(err);
			}
		}, POLL_MS);
		return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
	}, [job]);

	const triggerScrape = async () => {
		setJobError(null);
		try {
			const res = (await scrapeApi.enqueue(platform, username)) as DetailJob;
			setJob({ jobId: res.jobId, status: res.status || "waiting" });
		} catch (err) {
			setJobError(err);
		}
	};

	const exportJson = () => {
		if (!raw) return;
		const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${platform}-${username}-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	};

	const reload = () => setReloadNonce((n) => n + 1);

	return { inf, raw, loading, error, notFound, job, jobError, triggerScrape, exportJson, reload };
};
