"use client";

import { useEffect, useState } from "react";
import { PostCard, type Post } from "./post-card";
import { FetchMorePostsButton } from "./fetch-more-posts";

const PAGE_SIZE = 10;

type Kind = "posts" | "reels";

type Props = {
	posts: Post[];
	platform: string;
	username: string;
	kind?: Kind;
	onReload: () => void;
};

const noun = (kind: Kind) => (kind === "reels" ? "reels" : "posts");
const Noun = (kind: Kind) => (kind === "reels" ? "REELS" : "POSTS");

export const PostsGrid = ({ posts, platform, username, kind = "posts", onReload }: Props) => {
	const [visible, setVisible] = useState(PAGE_SIZE);

	// If the list grows (e.g. fetch-more added rows), don't auto-expand the
	// reveal — keep the user's last "show more" position. Clamp if it shrunk.
	useEffect(() => {
		setVisible((v) => Math.min(v, Math.max(PAGE_SIZE, posts.length)));
	}, [posts.length]);

	if (!posts.length) {
		return (
			<div className="glass" style={{ padding: 28, color: "var(--tx-3)", textAlign: "center" }}>
				<div style={{ fontSize: 13, color: "var(--tx-3)" }}>
					No {noun(kind)} captured yet. Click below to walk IG&apos;s feed and pull the latest 10.
				</div>
				<div style={{ marginTop: 14, display: "inline-flex" }}>
					<FetchMorePostsButton platform={platform} username={username} kind={kind} onDone={onReload} />
				</div>
			</div>
		);
	}

	const shown = posts.slice(0, visible);
	const hasMore = visible < posts.length;
	const remaining = posts.length - visible;

	return (
		<>
			<div style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
				gap: 14,
			}}>
				{shown.map((p) => <PostCard key={p.id} p={p} />)}
			</div>

			<div style={{
				display: "flex", justifyContent: "space-between", alignItems: "center",
				gap: 12, marginTop: 18, flexWrap: "wrap",
			}}>
				<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
					{hasMore ? (
						<button
							className="btn btn-sm btn-ghost"
							onClick={() => setVisible((v) => Math.min(v + PAGE_SIZE, posts.length))}
							title={`Reveal the next batch from ${noun(kind)} already in the DB`}
						>
							SHOW {Math.min(PAGE_SIZE, remaining)} MORE
						</button>
					) : (
						<span className="mono muted" style={{ fontSize: 11 }}>
							SHOWING ALL {posts.length} STORED {Noun(kind)}
						</span>
					)}
					<span className="mono muted" style={{ fontSize: 11 }}>
						{shown.length} / {posts.length}
					</span>
					{visible > PAGE_SIZE && (
						<button
							className="btn btn-sm btn-ghost"
							onClick={() => setVisible(PAGE_SIZE)}
							title="Collapse back to the first 10"
						>
							COLLAPSE
						</button>
					)}
				</div>
				{/* Hits IG: pulls 10 more {posts|reels} deeper into the feed
				    using the persisted cursor on the influencer row. */}
				<FetchMorePostsButton platform={platform} username={username} kind={kind} onDone={onReload} />
			</div>
		</>
	);
};
