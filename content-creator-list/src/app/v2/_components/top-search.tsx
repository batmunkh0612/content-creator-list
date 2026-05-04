"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { influencerApi } from "@/lib/api-endpoints";
import { toV2, type V2Influencer } from "@/lib/adapter";
import { Icon } from "@/components/v2/icon";
import { Avatar } from "@/components/v2/avatar";
import { VerifiedTick } from "@/components/v2/verified-tick";
import { PlatformPill } from "@/components/v2/badges";
import { compactNum } from "@/lib/format";

type ListResp = { items: Array<Parameters<typeof toV2>[0]> };

export const TopSearch = ({ platform }: { platform: string }) => {
	const router = useRouter();
	const [q, setQ] = useState("");
	const [matches, setMatches] = useState<V2Influencer[]>([]);
	const [open, setOpen] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!q.trim()) { setMatches([]); return; }
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(async () => {
			try {
				const params: Record<string, unknown> = { limit: 30 };
				if (platform !== "all") params.platform = platform;
				const d = (await influencerApi.list(params)) as ListResp;
				const term = q.trim().toLowerCase();
				const filtered = d.items
					.filter((i) =>
						i.username.toLowerCase().includes(term) ||
						(i.fullName || "").toLowerCase().includes(term)
					)
					.slice(0, 6)
					.map(toV2);
				setMatches(filtered);
			} catch {
				setMatches([]);
			}
		}, 200);
		return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
	}, [q, platform]);

	const goTo = (m: V2Influencer) => {
		setOpen(false);
		setQ("");
		router.push(`/v2/influencers/${m.platform}/${m.username}`);
	};

	return (
		<div className="search">
			<span className="search-icon"><Icon name="search" size={15} /></span>
			<input
				placeholder="Search creators by handle or name…"
				value={q}
				onChange={(e) => { setQ(e.target.value); setOpen(true); }}
				onFocus={() => setOpen(true)}
				onBlur={() => setTimeout(() => setOpen(false), 150)}
			/>
			<kbd>⌘K</kbd>
			{open && matches.length > 0 && (
				<div style={{
					position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
					background: "rgba(15,15,25,0.95)",
					backdropFilter: "blur(20px)",
					border: "1px solid var(--line-2)",
					borderRadius: 12, padding: 6, zIndex: 30,
					boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
				}}>
					{matches.map((m) => (
						<div key={m.id} onMouseDown={() => goTo(m)}
							style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}
							onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
							onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
							<Avatar inf={m} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
									@{m.username} {m.isVerified && <VerifiedTick size={12} />}
								</div>
								<div style={{ fontSize: 11, color: "var(--tx-3)", fontFamily: "var(--mono)" }}>
									{compactNum(m.followers)} followers
								</div>
							</div>
							<PlatformPill platform={m.platform} />
						</div>
					))}
				</div>
			)}
		</div>
	);
};
