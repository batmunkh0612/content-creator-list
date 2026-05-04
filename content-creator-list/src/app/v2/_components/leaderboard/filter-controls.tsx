"use client";

import { Icon } from "@/components/v2/icon";
import { useDebouncedQueryParam } from "@/lib/query-state";

type NumberFilterProps = { paramKey: string; placeholder: string; width?: number; step?: number };

// Local mirror of a URL number param. Smooth typing, debounced URL writes —
// a user typing "100000" doesn't push 6 history entries.
export const NumberFilter = ({ paramKey, placeholder, width = 120, step = 1 }: NumberFilterProps) => {
	const [value, setValue] = useDebouncedQueryParam(paramKey);
	return (
		<input
			type="number"
			inputMode="numeric"
			min={0}
			step={step}
			placeholder={placeholder}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			style={{
				width, height: 30,
				padding: "0 10px",
				background: "rgba(255,255,255,0.04)",
				border: "1px solid var(--line-2)",
				borderRadius: 8, color: "var(--tx-1)",
				fontSize: 12, outline: "none",
				fontFamily: "var(--mono)",
			}}
		/>
	);
};

type SearchFilterProps = { paramKey: string; placeholder?: string; width?: number };

export const SearchFilter = ({ paramKey, placeholder = "Filter handle…", width = 200 }: SearchFilterProps) => {
	const [value, setValue] = useDebouncedQueryParam(paramKey);
	return (
		<div style={{ position: "relative", width }}>
			<span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--tx-3)" }}>
				<Icon name="search" size={14} />
			</span>
			<input
				type="search"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder={placeholder}
				style={{
					width: "100%", height: 30,
					padding: "0 10px 0 30px",
					background: "rgba(255,255,255,0.04)",
					border: "1px solid var(--line-2)",
					borderRadius: 8, color: "var(--tx-1)",
					fontSize: 12, outline: "none",
				}}
			/>
		</div>
	);
};

export type SortOption = { id: string; label: string };

type SortProps = {
	value: string;
	options: SortOption[];
	open: boolean;
	setOpen: (v: boolean) => void;
	onPick: (id: string) => void;
};

export const SortDropdown = ({ value, options, open, setOpen, onPick }: SortProps) => {
	const current = options.find((o) => o.id === value);
	return (
		<div style={{ position: "relative" }}>
			<button className="btn btn-sm" onClick={() => setOpen(!open)}>
				{current?.label} <Icon name="chevron" size={12} />
			</button>
			{open && (
				<div style={{
					position: "absolute", top: "calc(100% + 4px)", right: 0,
					background: "rgba(15,15,25,0.95)",
					backdropFilter: "blur(20px)",
					border: "1px solid var(--line-2)",
					borderRadius: 10, padding: 4, minWidth: 180, zIndex: 30,
					boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
				}}>
					{options.map((o) => (
						<button key={o.id}
							onClick={() => onPick(o.id)}
							className="btn btn-sm btn-ghost"
							style={{
								width: "100%", justifyContent: "flex-start",
								background: o.id === value ? "rgba(139,92,246,0.16)" : "transparent",
								border: "none",
							}}>
							{o.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
};
