"use client";

import { BrandMark } from "@/components/v2/brand-mark";
import { SidebarNav } from "./sidebar-nav";
import { SidebarAccount } from "./sidebar-account";

export const Sidebar = () => (
	<aside className="sidebar">
		<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 4px 4px" }}>
			<div className="brand-mark"><BrandMark /></div>
			<div className="brand-name">
				<b>Influ</b><span className="gloss">Pulse</span>
			</div>
		</div>

		<SidebarNav />

		<div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
			<SidebarAccount />
			<div className="live-ticker"><span className="pulse-dot" /> LIVE · v2.0</div>
		</div>
	</aside>
);
