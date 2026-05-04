"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "./icon";

type Props = {
	open: boolean;
	onClose?: () => void;
	title: string;
	eyebrow?: string;
	children: ReactNode;
	width?: number;
	padded?: boolean;
};

export const Modal = ({ open, onClose, title, eyebrow, children, width = 640, padded = true }: Props) => {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
		window.addEventListener("keydown", onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = prev;
		};
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div role="dialog" aria-modal="true" style={{
			position: "fixed", inset: 0, zIndex: 60,
			display: "grid", placeItems: "center",
			padding: 16,
			animation: "v2-modal-in 160ms ease-out",
		}}>
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				style={{
					position: "absolute", inset: 0,
					background: "rgba(8,8,16,0.65)",
					backdropFilter: "blur(12px)",
					border: "none", cursor: "default",
				}}
			/>
			<div className="glass" style={{
				position: "relative",
				width: "100%", maxWidth: width,
				maxHeight: "calc(100vh - 32px)",
				display: "flex", flexDirection: "column",
				overflow: "hidden",
				boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.18)",
			}}>
				<header style={{
					display: "flex", alignItems: "center", justifyContent: "space-between",
					padding: "14px 18px",
					borderBottom: "1px solid var(--line-1)",
					background: "linear-gradient(180deg, rgba(139,92,246,0.08), rgba(139,92,246,0))",
					flexShrink: 0,
				}}>
					<div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
						{eyebrow && (
							<span className="mono" style={{ fontSize: 10, color: "var(--tx-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
								{eyebrow}
							</span>
						)}
						<h2 style={{
							margin: 0, fontSize: 15, fontWeight: 600,
							letterSpacing: "-0.01em",
							overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
						}}>
							{title}
						</h2>
					</div>
					<button type="button" onClick={onClose} aria-label="Close" className="btn btn-sm btn-ghost" style={{ minWidth: 32, padding: "0 8px" }}>
						<Icon name="arrow" size={12} /> ESC
					</button>
				</header>
				<div style={{ padding: padded ? 18 : 0, overflowY: "auto", minHeight: 0 }}>
					{children}
				</div>
			</div>
			<style>{`@keyframes v2-modal-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
		</div>
	);
};
