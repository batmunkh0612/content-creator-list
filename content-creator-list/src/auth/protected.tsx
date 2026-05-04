"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./auth-context";

// Client-side gate. Renders a centered loader while auth bootstraps, and
// redirects to /login once we know the visitor is unauthenticated.
export const Protected = ({ children }: { children: ReactNode }) => {
	const { token, user, loading, hydrated } = useAuth();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		if (hydrated && !token) {
			const next = encodeURIComponent(pathname || "/v2");
			router.replace(`/login?next=${next}`);
		}
	}, [hydrated, token, pathname, router]);

	if (!hydrated || !token || (!user && loading)) {
		return (
			<div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
				<div className="mono" style={{ color: "#8a8a9a", fontSize: 12, letterSpacing: "0.1em" }}>
					LOADING…
				</div>
			</div>
		);
	}

	return <>{children}</>;
};
