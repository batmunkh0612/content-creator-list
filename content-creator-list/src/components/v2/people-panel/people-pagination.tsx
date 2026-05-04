"use client";

import { PAGE_SIZE } from "./use-people-data";

type Props = {
	page: number;
	totalPages: number;
	offset: number;
	total: number;
	onPageChange: (n: number) => void;
};

export const PeoplePagination = ({ page, totalPages, offset, total, onPageChange }: Props) => (
	<div style={{
		display: "flex", alignItems: "center", justifyContent: "space-between",
		marginTop: 16, color: "var(--tx-3)",
		fontFamily: "var(--mono)", fontSize: 12,
	}}>
		<span>{offset + 1}—{Math.min(offset + PAGE_SIZE, total)} OF {total}</span>
		<div style={{ display: "flex", gap: 6 }}>
			<button className="btn btn-sm btn-ghost" disabled={page === 0} onClick={() => onPageChange(Math.max(0, page - 1))}>
				← Prev
			</button>
			<span className="btn btn-sm" style={{ pointerEvents: "none", opacity: 0.7 }}>{page + 1}/{totalPages}</span>
			<button className="btn btn-sm btn-ghost" disabled={page + 1 >= totalPages} onClick={() => onPageChange(page + 1)}>
				Next →
			</button>
		</div>
	</div>
);
