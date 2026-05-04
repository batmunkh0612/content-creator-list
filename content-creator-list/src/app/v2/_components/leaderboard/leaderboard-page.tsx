"use client";

import { useState } from "react";
import { ErrorRow } from "@/components/v2/error-row";
import { usePlatform } from "../platform-context";
import { useLeaderboard, PAGE_SIZE } from "./use-leaderboard";
import { Hero, type ModalKey } from "./hero";
import { FilterBar } from "./filter-bar";
import { LeaderboardTable } from "./leaderboard-table";
import { Pagination } from "./pagination";
import { ModalsHost } from "./modals-host";

export const LeaderboardPage = () => {
	const { platform } = usePlatform();
	const lb = useLeaderboard(platform);
	const [openModal, setOpenModal] = useState<ModalKey>(null);

	return (
		<>
			<Hero
				items={lb.data?.items}
				total={lb.data?.total}
				onOpenModal={setOpenModal}
				onScrapeEnqueued={lb.triggerRefresh}
			/>

			<div className="sec-head">
				<div className="sec-title">
					<span className="crumb">01 — directory</span>
					<h2>{lb.q ? `Search · "${lb.q}"` : `All creators${lb.data ? ` · ${lb.data.total}` : ""}`}</h2>
				</div>
				<FilterBar
					sortBy={lb.sortBy}
					onSort={lb.setSortBy}
					filtersActive={lb.filtersActive}
					onReset={lb.resetFilters}
				/>
			</div>

			{lb.error ? <ErrorRow err={lb.error} /> : null}

			<LeaderboardTable
				loading={lb.loading}
				hasData={!!lb.data}
				q={lb.q}
				filtered={lb.filtered}
				offset={lb.data?.offset || 0}
				showMedal={lb.sortBy === "trending"}
			/>

			<ModalsHost
				open={openModal}
				platform={platform}
				totalProfiles={lb.data?.total || 0}
				onClose={() => setOpenModal(null)}
				onDone={lb.triggerRefresh}
			/>

			{lb.data && lb.data.total > PAGE_SIZE && (
				<Pagination
					offset={lb.data.offset}
					total={lb.data.total}
					page={lb.page}
					currentPage={lb.currentPage}
					totalPages={lb.totalPages}
					onPageChange={lb.setPage}
				/>
			)}
		</>
	);
};
