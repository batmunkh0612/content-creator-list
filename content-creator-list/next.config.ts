import type { NextConfig } from "next";

// Backend API target — Express server defined at ../src/app.js, mounted at
// the root (`/auth/login`, `/influencer/...`, etc.). The frontend talks to
// it via the `/api` prefix so the same client code works in dev and prod.
//
// IMPORTANT: read inside `rewrites()` (not at module top level) so the env
// is picked up when the standalone server boots, not when `next build`
// captures the config. That lets docker-compose's environment block override
// the value at runtime without a rebuild.
const resolveApiTarget = () => process.env.API_PROXY_TARGET || "http://localhost:3000";

const nextConfig: NextConfig = {
	// `standalone` builds a self-contained server.js + minimal node_modules
	// under .next/standalone, so the production Docker image can run
	// `node server.js` without re-installing the full dep tree.
	// (Cloudflare deploys via opennext, which ignores this — only matters
	// for the docker-compose web service.)
	output: "standalone",
	async rewrites() {
		const target = resolveApiTarget();
		// Surfaced once at startup so misconfigured env (e.g. forgetting
		// API_PROXY_TARGET inside Docker) is obvious in the logs.
		// eslint-disable-next-line no-console
		console.log(`[next] /api/* → ${target}/* (API_PROXY_TARGET)`);
		return [
			{
				// `/api/auth/login` → `${target}/auth/login`
				source: "/api/:path*",
				destination: `${target}/:path*`,
			},
		];
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev` ONLY. The helper
// spawns `workerd` (Cloudflare's runtime); during `next build` inside the
// production Docker image that binary either isn't present or isn't musl-
// compatible on alpine, so the build crashes with ENOENT.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
//
// `@opennextjs/cloudflare@1.19.4` also ships a broken .d.ts under pnpm's
// nested store layout — the runtime export resolves correctly; cast around
// the type-only issue.
if (process.env.NODE_ENV === "development") {
	import("@opennextjs/cloudflare").then((m) => {
		const init = (m as unknown as { initOpenNextCloudflareForDev: () => Promise<void> })
			.initOpenNextCloudflareForDev;
		if (typeof init === "function") init();
	});
}
