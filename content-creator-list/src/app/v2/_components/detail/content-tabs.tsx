"use client";

import { compactNum } from "@/lib/format";
import { PeoplePanel } from "@/components/v2/people-panel";
import type { V2Influencer } from "@/lib/adapter";
import { useQueryState } from "@/lib/query-state";
import { PostsGrid } from "./posts-grid";
import { StoriesStrip, type Story } from "./stories-strip";
import type { RawProfile } from "./use-detail";
import type { Post } from "./post-card";

type TabId = "posts" | "reels" | "stories" | "followers" | "following";

const TAB_VALUES: TabId[] = ["posts", "reels", "stories", "followers", "following"];

const tabBg = (active: boolean) =>
	active
		? "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))"
		: "transparent";

const tabColor = (disabled: boolean, active: boolean) =>
	disabled ? "var(--tx-4)" : active ? "var(--tx-1)" : "var(--tx-3)";

type ContentTabsProps = {
	inf: V2Influencer;
	raw: RawProfile | null;
	onReload: () => void;
};

const splitContent = (raw: RawProfile | null) => {
	const all = (raw?.posts || []) as Post[];
	const reels = all.filter((p) => (p.mediaType || "").toLowerCase() === "reel");
	const posts = all.filter((p) => (p.mediaType || "").toLowerCase() !== "reel");
	return { posts, reels };
};

export const ContentTabs = ({ inf, raw, onReload }: ContentTabsProps) => {
	const { get, update } = useQueryState();
	const rawTab = get("tab") as TabId;
	const tab: TabId = (TAB_VALUES as string[]).includes(rawTab) ? rawTab : "posts";
	const igOnly = inf.platform === "instagram";

	// Tab change clears panel-local state (page, q) — those belong to whatever
	// list was previously on screen, not the new one.
	const setTab = (next: TabId) => {
		update({ tab: next === "posts" ? null : next, page: null, q: null });
	};

	const { posts, reels } = splitContent(raw);
	const stories = ((raw as RawProfile & { stories?: Story[] })?.stories || []) as Story[];

	const tabs: Array<{ id: TabId; label: string; igOnly?: boolean }> = [
		{ id: "posts",     label: `POSTS · ${posts.length}` },
		{ id: "reels",     label: `REELS · ${reels.length}`,   igOnly: true },
		{ id: "stories",   label: `STORIES · ${stories.length}`, igOnly: true },
		{ id: "followers", label: `FOLLOWERS${inf.followersFetched ? ` · ${compactNum(inf.followersFetched)}` : ""}`, igOnly: true },
		{ id: "following", label: `FOLLOWING${inf.followingFetched ? ` · ${compactNum(inf.followingFetched)}` : ""}`, igOnly: true },
	];

	return (
		<>
			<div className="sec-head" style={{ marginBottom: 14 }}>
				<div style={{
					display: "flex", gap: 4, padding: 4,
					background: "rgba(255,255,255,0.04)",
					border: "1px solid var(--line-1)",
					borderRadius: 12,
					flexWrap: "wrap",
				}}>
					{tabs.map((t) => {
						const disabled = !!t.igOnly && !igOnly;
						const active = tab === t.id;
						return (
							<button
								key={t.id}
								disabled={disabled}
								onClick={() => !disabled && setTab(t.id)}
								title={disabled ? "Instagram only" : undefined}
								style={{
									padding: "8px 14px", borderRadius: 8, border: "none",
									fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.06em",
									cursor: disabled ? "not-allowed" : "pointer",
									background: tabBg(active),
									color: tabColor(disabled, active),
									boxShadow: active ? "inset 0 0 0 1px var(--line-2)" : "none",
								}}
							>
								{t.label}
								{disabled && <span style={{ marginLeft: 6, opacity: 0.6 }}>(IG only)</span>}
							</button>
						);
					})}
				</div>
			</div>

			{tab === "posts" && (
				<PostsGrid posts={posts}    platform={inf.platform} username={inf.username} kind="posts" onReload={onReload} />
			)}
			{tab === "reels" && igOnly && (
				<PostsGrid posts={reels}    platform={inf.platform} username={inf.username} kind="reels" onReload={onReload} />
			)}
			{tab === "stories" && igOnly && (
				<StoriesStrip stories={stories} platform={inf.platform} username={inf.username} onReload={onReload} />
			)}
			{tab === "followers" && igOnly && (
				<PeoplePanel kind="followers" platform={inf.platform} username={inf.username} totalProfileCount={inf.followers} />
			)}
			{tab === "following" && igOnly && (
				<PeoplePanel kind="following" platform={inf.platform} username={inf.username} totalProfileCount={inf.following} />
			)}
		</>
	);
};
