"use client";

import { useState } from "react";
import { Icon } from "@/components/v2/icon";
import { NumberFilter, SearchFilter, SortDropdown, type SortOption } from "./filter-controls";
import type { SortBy } from "./use-leaderboard";

const SORTS: SortOption[] = [
	{ id: "trending",   label: "Trending Score" },
	{ id: "followers",  label: "Followers" },
	{ id: "engagement", label: "Engagement" },
	{ id: "recent",     label: "Recently scraped" },
];

type Props = {
	sortBy: SortBy;
	onSort: (s: SortBy) => void;
	filtersActive: boolean;
	onReset: () => void;
};

// Self-contained filter row above the leaderboard. Every input is bound to a
// URL query param via the shared hooks — no local prop drilling for state.
export const FilterBar = ({ sortBy, onSort, filtersActive, onReset }: Props) => {
	const [sortOpen, setSortOpen] = useState(false);

	return (
		<div className="sec-actions" style={{ flexWrap: "wrap" }}>
			<NumberFilter paramKey="minF" placeholder="min followers" />
			<NumberFilter paramKey="maxF" placeholder="max followers" />
			<NumberFilter paramKey="minE" placeholder="min engagement %" width={130} step={0.1} />
			<SearchFilter paramKey="q" />
			<SortDropdown
				value={sortBy}
				options={SORTS}
				open={sortOpen}
				setOpen={setSortOpen}
				onPick={(s) => { onSort(s as SortBy); setSortOpen(false); }}
			/>
			{filtersActive && (
				<button className="btn btn-sm btn-ghost" onClick={onReset} title="Clear all filters">
					✕ Reset
				</button>
			)}
			<button className="btn btn-sm btn-ghost" disabled>
				<Icon name="download" size={13} /> Export
			</button>
		</div>
	);
};
