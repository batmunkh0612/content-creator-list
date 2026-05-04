"use client";

import { PAGE_SIZE } from "./use-leaderboard";

type Props = {
	offset: number;
	total: number;
	page: number;
	currentPage: number;
	totalPages: number;
	onPageChange: (next: number) => void;
};

export const Pagination = ({ offset, total, page, currentPage, totalPages, onPageChange }: Props) => (
	<div style={{
		display: "flex", alignItems: "center", justifyContent: "space-between",
		marginTop: 16, padding: "12px 4px",
		color: "var(--tx-3)", fontFamily: "var(--mono)", fontSize: 12,
	}}>
		<span>SHOWING {offset + 1}—{Math.min(offset + PAGE_SIZE, total)} OF {total}</span>
		<div style={{ display: "flex", gap: 6 }}>
			<button className="btn btn-sm btn-ghost" disabled={page === 0} onClick={() => onPageChange(Math.max(0, page - 1))}>
				← Prev
			</button>
			<span className="btn btn-sm" style={{ pointerEvents: "none", opacity: 0.7 }}>
				{currentPage}/{totalPages}
			</span>
			<button className="btn btn-sm btn-ghost" disabled={currentPage >= totalPages} onClick={() => onPageChange(page + 1)}>
				Next →
			</button>
		</div>
	</div>
);
