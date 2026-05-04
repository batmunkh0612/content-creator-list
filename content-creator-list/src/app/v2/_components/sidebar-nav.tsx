"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/v2/icon";

const NAV: Array<{ href: string; icon: IconName; label: string; count?: string; dim?: boolean; exact?: boolean }> = [
	{ href: "/v2",             icon: "trophy",  label: "Leaderboard",     count: "TOP 10", exact: true },
	{ href: "/v2/trending",    icon: "fire",    label: "Trending Now" },
	{ href: "/v2/influencers", icon: "radar",   label: "Creator Lookup" },
	{ href: "/v2/jobs",        icon: "chart",    label: "Jobs" },
	{ href: "/v2/sessions",    icon: "settings", label: "IG Sessions" },
	{ href: "/v2/network",     icon: "spark",    label: "Network Graph",   dim: true },
	{ href: "/v2/watchlist",   icon: "users",   label: "Watchlist",       count: "12", dim: true },
	{ href: "/v2/reports",     icon: "chart",   label: "Reports",         dim: true },
];

const isActive = (pathname: string | null, href: string, exact?: boolean) => {
	if (!pathname) return false;
	return exact ? pathname === href : pathname.startsWith(href);
};

export const SidebarNav = () => {
	const pathname = usePathname();
	return (
		<nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
			{NAV.map((n) =>
				n.dim ? (
					<div key={n.label} className="nav-item" style={{ opacity: 0.45, cursor: "not-allowed" }} title="Coming soon">
						<Icon name={n.icon} />
						<span>{n.label}</span>
						{n.count && <span className="count">{n.count}</span>}
					</div>
				) : (
					<Link
						key={n.href}
						href={n.href}
						className={`nav-item ${isActive(pathname, n.href, n.exact) ? "active" : ""}`}
					>
						<Icon name={n.icon} />
						<span>{n.label}</span>
						{n.count && <span className="count">{n.count}</span>}
					</Link>
				)
			)}
		</nav>
	);
};
