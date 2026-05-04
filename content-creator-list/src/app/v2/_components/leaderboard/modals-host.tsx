"use client";

import { BulkScrapeModal } from "@/components/v2/bulk-scrape-modal";
import { RefreshAllModal } from "@/components/v2/refresh-all-modal";
import { RefreshAllFollowersModal } from "@/components/v2/refresh-all-followers-modal";
import type { ModalKey } from "./hero";

type Props = {
	open: ModalKey;
	platform: string;
	totalProfiles: number;
	onClose: () => void;
	onDone: () => void;
};

export const ModalsHost = ({ open, platform, totalProfiles, onClose, onDone }: Props) => {
	if (open === "bulk")    return <BulkScrapeModal onClose={onClose} onDone={onDone} />;
	if (open === "refresh") return <RefreshAllModal defaultPlatform={platform === "all" ? "" : platform} onClose={onClose} onDone={onDone} />;
	if (open === "fers")    return <RefreshAllFollowersModal kind="followers" totalProfiles={totalProfiles} onClose={onClose} onDone={onDone} />;
	if (open === "fing")    return <RefreshAllFollowersModal kind="following" totalProfiles={totalProfiles} onClose={onClose} onDone={onDone} />;
	return null;
};
