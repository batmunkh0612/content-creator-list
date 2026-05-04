"use client";

import { useState } from "react";
import { proxiedImage } from "@/lib/image-proxy";
import { compactNum, fmtRelDate } from "@/lib/format";

export type Post = {
	id: string;
	mediaUrl?: string | null;
	mediaType?: string | null;
	permalink?: string | null;
	likes?: number | null;
	comments?: number | null;
	views?: number | null;
	caption?: string | null;
	postedAt?: string | null;
};

const mediaLabel = (mediaType: string) =>
	mediaType === "video"    ? "▶ Video" :
	mediaType === "carousel" ? "☷ Carousel" : mediaType.toUpperCase();

const overlayPill: React.CSSProperties = {
	position: "absolute",
	background: "rgba(11,11,18,0.72)",
	backdropFilter: "blur(4px)",
	border: "1px solid var(--line-2)",
	borderRadius: 999,
	padding: "4px 9px",
	fontFamily: "var(--mono)",
	fontSize: 11,
	display: "inline-flex",
	alignItems: "center",
	gap: 5,
};

export const PostCard = ({ p }: { p: Post }) => {
	const [broken, setBroken] = useState(false);
	const proxied = proxiedImage(p.mediaUrl);
	const showImg = !!proxied && !broken;
	const mediaType = (p.mediaType || "post").toLowerCase();
	const isVideo = mediaType === "video";
	const hasViews = p.views != null;

	return (
		<a
			className="glass"
			href={p.permalink || "#"}
			target={p.permalink ? "_blank" : undefined}
			rel="noreferrer"
			style={{
				display: "block", overflow: "hidden",
				color: "inherit", textDecoration: "none",
				transition: "transform 200ms ease, border-color 200ms ease",
			}}
			onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
			onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "none"; }}
		>
			<div style={{
				position: "relative",
				aspectRatio: "1/1",
				background: "linear-gradient(135deg,#1f1f30,#0b0b12)",
				borderBottom: "1px solid var(--line-1)",
				display: "grid", placeItems: "center",
				overflow: "hidden",
			}}>
				{showImg ? (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img src={proxied!} alt="" loading="lazy" onError={() => setBroken(true)}
						style={{ width: "100%", height: "100%", objectFit: "cover" }} />
				) : (
					<span style={{ color: "var(--tx-3)", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
						{mediaType}
					</span>
				)}

				{/* Media-type chip top-right (only for non-image) */}
				{mediaType !== "image" && (
					<span style={{
						...overlayPill,
						top: 8, right: 8,
						color: "#fff",
						fontSize: 10,
						letterSpacing: "0.08em",
						textTransform: "uppercase",
					}}>
						{mediaLabel(mediaType)}
					</span>
				)}

				{/* Video view-count pill — top-left, prominent. IG sometimes hides
				    play_count even on videos; only render when we have a number. */}
				{isVideo && hasViews && (
					<span
						style={{ ...overlayPill, top: 8, left: 8, color: "#93e9ff" }}
						title={`${(p.views ?? 0).toLocaleString()} views`}
					>
						▶ {compactNum(p.views)}
					</span>
				)}

				{/* Likes pill bottom-left */}
				<span style={{ ...overlayPill, left: 8, bottom: 8, color: "#ff8aa0" }}>
					♥ {compactNum(p.likes)}
				</span>

				{/* Comments pill bottom-right (mirrors likes for symmetry) */}
				<span style={{ ...overlayPill, right: 8, bottom: 8, color: "#c4b5ff" }}>
					💬 {compactNum(p.comments)}
				</span>
			</div>

			<div style={{ padding: "12px 14px" }}>
				{p.caption ? (
					<div style={{
						fontSize: 12, color: "var(--tx-2)", lineHeight: 1.5,
						display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
						overflow: "hidden", minHeight: 36,
					}}>
						{p.caption}
					</div>
				) : (
					<div style={{ minHeight: 36 }} />
				)}

				<div style={{
					display: "flex", justifyContent: "space-between", alignItems: "center",
					marginTop: 10, paddingTop: 10,
					borderTop: "1px solid var(--line-1)",
					fontFamily: "var(--mono)", fontSize: 11,
					color: "var(--tx-3)",
				}}>
					{/* Engagement-rate-on-post: (likes + comments) / views (if any) */}
					{isVideo && hasViews && (p.views ?? 0) > 0 ? (
						<span title="(likes + comments) / views">
							ENG {(((p.likes ?? 0) + (p.comments ?? 0)) / (p.views as number) * 100).toFixed(2)}%
						</span>
					) : (
						<span>{p.permalink ? "OPEN ↗" : "—"}</span>
					)}
					{p.postedAt && <span>{fmtRelDate(p.postedAt)}</span>}
				</div>
			</div>
		</a>
	);
};
