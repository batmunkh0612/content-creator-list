"use client";

import { Icon } from "../icon";
import { ErrorRow } from "../error-row";
import { PersonCard } from "./person-card";
import { PeopleHeader } from "./people-header";
import { PeopleSearch } from "./people-search";
import { PeoplePagination } from "./people-pagination";
import { usePeopleData, PAGE_SIZE, TERMINAL, type PeopleKind } from "./use-people-data";

type Props = {
	kind: PeopleKind;
	platform: string;
	username: string;
	totalProfileCount?: number;
};

export const PeoplePanel = ({ kind, platform, username, totalProfileCount = 0 }: Props) => {
	const {
		data, loading, error, page, setPage, q,
		job, scrapeError, triggerFetch, reload, isFollowers, batchSize,
	} = usePeopleData({ kind, platform, username });

	const labels = isFollowers
		? { title: "FOLLOWERS", cta: `FETCH ${batchSize} FOLLOWERS`, empty: "No followers fetched yet." }
		: { title: "FOLLOWING", cta: `FETCH ${batchSize} FOLLOWING`, empty: "No following fetched yet." };

	const meta = (data?.influencer || {}) as Record<string, unknown>;
	const fetchedField = isFollowers ? "followersFetched"   : "followingFetched";
	const blockedField = isFollowers ? "followersBlocked"   : "followingBlocked";
	const lastField    = isFollowers ? "followersFetchedAt" : "followingFetchedAt";
	// `meta[fetchedField]` is a cached counter on the influencer row that the
	// worker bumps after a successful fetch. When a job is blocked early it
	// can lag behind the actual row count — `data.total` is authoritative for
	// "do we have anything in the DB?", so prefer the larger of the two.
	const cachedCount = (meta[fetchedField] as number | undefined) ?? 0;
	const persistedCount = data?.total ?? 0;
	const fetched = Math.max(cachedCount, persistedCount);
	const blocked = meta[blockedField] as boolean | undefined;
	const trackedOverlap = (meta.trackedOverlap as number | undefined) ?? 0;
	const isRunning = !!job && !TERMINAL.has(job.status);
	const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
	const pct = totalProfileCount > 0 ? Math.min(100, (fetched / totalProfileCount) * 100) : 0;

	if (!loading && fetched === 0 && !isRunning) {
		return (
			<div className="glass" style={{ padding: 28, textAlign: "center" }}>
				<div className="mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--tx-3)", textTransform: "uppercase" }}>
					{labels.empty}
				</div>
				<p className="muted" style={{ fontSize: 13, margin: "10px auto 18px", maxWidth: 480 }}>
					Tap below to fetch what&apos;s visible. Instagram caps anonymous follower visibility — expect 40–200 per profile unless the session follows the target.
				</p>
				<button onClick={triggerFetch} className="btn btn-primary" disabled={isRunning}>
					<Icon name="radar" size={13} /> {labels.cta}
				</button>
				{scrapeError ? <ErrorRow err={scrapeError} /> : null}
			</div>
		);
	}

	return (
		<>
			<PeopleHeader
				title={labels.title}
				fetched={fetched}
				totalProfileCount={totalProfileCount}
				trackedOverlap={trackedOverlap}
				blocked={blocked}
				lastFetchedAt={meta[lastField] as string | undefined}
				pct={pct}
				job={job}
				scrapeError={scrapeError}
				batchSize={batchSize}
				onRefetch={triggerFetch}
			/>

			<PeopleSearch kind={kind} />

			{error ? <ErrorRow err={error} /> : null}

			{loading && !data ? (
				<div className="glass" style={{ padding: 40, textAlign: "center", color: "var(--tx-3)" }}>Loading…</div>
			) : !data?.items?.length ? (
				<div className="glass" style={{ padding: 40, textAlign: "center", color: "var(--tx-3)" }}>
					{q ? `No matches for "${q}"` : "Nothing persisted yet."}
				</div>
			) : (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
					{data.items.map((p) => (
						<PersonCard key={p.username} p={p} platform={platform} onScraped={reload} />
					))}
				</div>
			)}

			{data && totalPages > 1 && (
				<PeoplePagination
					page={page}
					totalPages={totalPages}
					offset={data.offset}
					total={data.total}
					onPageChange={setPage}
				/>
			)}
		</>
	);
};
