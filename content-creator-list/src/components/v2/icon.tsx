import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
	search: (
		<>
			<circle cx="11" cy="11" r="7" stroke="currentColor" fill="none" strokeWidth="1.6" />
			<path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
		</>
	),
	bell: (
		<>
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinejoin="round" />
			<path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
		</>
	),
	trophy: (
		<>
			<path d="M8 4h8v4a4 4 0 0 1-8 0z" stroke="currentColor" fill="none" strokeWidth="1.6" />
			<path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M10 13h4v3h-4z M9 20h6" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" />
		</>
	),
	fire: (
		<path d="M12 3s4 4 4 8a4 4 0 0 1-8 0c0-1 .3-2 .8-2.6C9 9 9 8 8.5 7 11 8 12 6 12 3z M9.5 15.5a2.5 2.5 0 0 0 5 0c0-1.4-.9-1.8-1.4-2.6-.6.7-1.2 1.1-2.6 1.1z" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinejoin="round" />
	),
	rocket: (
		<path d="M14 4c4 0 6 2 6 6-3 0-5 1-7 3l-2-2c2-2 3-4 3-7zm-3 10-4 4 1 1 4-4M5 15c-1 1-2 4-2 6 2 0 5-1 6-2z" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinejoin="round" />
	),
	chart: (
		<path d="M4 19V5M4 19h16M8 14l3-4 3 3 4-7" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
	),
	users: (
		<>
			<circle cx="9" cy="8" r="3.5" stroke="currentColor" fill="none" strokeWidth="1.6" />
			<path d="M2.5 19c.5-3 3-5 6.5-5s6 2 6.5 5M16 11a3 3 0 1 0 0-6M21.5 19c-.3-2.2-2-4-4.5-4.6" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" />
		</>
	),
	settings: (
		<>
			<circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" strokeWidth="1.6" />
			<path d="M19 13.5a7 7 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.6-1.5L13.5 2.5h-3l-.5 2.6a7 7 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.6 1.5l.5 2.6h3l.5-2.6a7 7 0 0 0 2.6-1.5l2.3 1 2-3.4z" stroke="currentColor" fill="none" strokeWidth="1.4" />
		</>
	),
	arrow:    <path d="M5 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
	chevron:  <path d="m9 6 6 6-6 6" stroke="currentColor" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
	download: <path d="M12 4v12m0 0-4-4m4 4 4-4M4 18h16" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
	pin:      <path d="M12 21v-7m0-9 5 5-2 1-1 4H10l-1-4-2-1z" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinejoin="round" />,
	radar: (
		<>
			<circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" strokeWidth="1.4" opacity=".4" />
			<circle cx="12" cy="12" r="5" stroke="currentColor" fill="none" strokeWidth="1.4" opacity=".7" />
			<circle cx="12" cy="12" r="1.5" fill="currentColor" />
		</>
	),
	spark: <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" />,
	out:   <path d="M14 4h6v6m0-6L10 14M8 6H4v14h14v-4" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
};

export type IconName = keyof typeof PATHS;

export const Icon = ({ name, size = 16 }: { name: IconName | string; size?: number }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
		{PATHS[name] || null}
	</svg>
);
