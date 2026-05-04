"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/auth-context";
import { Icon } from "@/components/v2/icon";

export const SidebarAccount = () => {
	const { user, logout } = useAuth();
	const router = useRouter();

	const onLogout = () => {
		logout();
		router.push("/login");
	};

	if (!user) return null;

	return (
		<div style={{
			padding: 12,
			border: "1px solid var(--line-1)",
			borderRadius: 12,
			background: "rgba(255,255,255,0.03)",
		}}>
			<div className="side-label" style={{ margin: 0 }}>ACCOUNT</div>
			<div style={{ marginTop: 6, fontSize: 12, color: "var(--tx-2)", wordBreak: "break-all" }}>
				{user.email}
			</div>
			<Link
				href="/v2/account"
				className="btn btn-sm"
				style={{
					width: "100%", marginTop: 10,
					display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
					textDecoration: "none",
				}}
			>
				<Icon name="settings" size={12} /> Settings
			</Link>
			<button onClick={onLogout} className="btn btn-sm" style={{ width: "100%", marginTop: 6 }}>
				Sign out
			</button>
		</div>
	);
};
