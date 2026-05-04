"use client";

import Link from "next/link";
import { useAuth } from "@/auth/auth-context";
import { Icon } from "@/components/v2/icon";
import { TopSearch } from "./top-search";
import { usePlatform } from "./platform-context";

const PLATFORMS = [
	{ id: "all",       label: "All",       cls: "" },
	{ id: "instagram", label: "Instagram", cls: "ig" },
	{ id: "tiktok",    label: "TikTok",    cls: "tt" },
	{ id: "youtube",   label: "YouTube",   cls: "yt" },
	{ id: "facebook",  label: "Facebook",  cls: "fb" },
];

export const TopNav = () => {
	const { user } = useAuth();
	const { platform, setPlatform } = usePlatform();
	const initials = (user?.name || user?.email || "?").slice(0, 1).toUpperCase();

	return (
		<div className="topnav">
			<TopSearch platform={platform} />

			<div className="platform-tabs">
				{PLATFORMS.map((p) => (
					<button
						key={p.id}
						className={platform === p.id ? `active ${p.cls}` : ""}
						onClick={() => setPlatform(p.id)}
					>
						{p.label}
					</button>
				))}
			</div>

			<div style={{ flex: 1 }} />
			<Link href="/v2/influencers" className="avatar-btn" style={{ textDecoration: "none" }}>
				<div className="avatar" style={{
					background: "linear-gradient(135deg,#ec4899,#8b5cf6)",
					display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 600,
				}}>
					{initials}
				</div>
				<span className="name">{user?.name || (user?.email || "Account").split("@")[0]}</span>
				<Icon name="chevron" size={14} />
			</Link>
		</div>
	);
};
