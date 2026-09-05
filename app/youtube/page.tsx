import type { Metadata } from "next";

import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "YouTube",
  description:
    "The most recent AI content from curated YouTube channels — aggregated in-site, played on-site.",
};

// FID-2026-0904-014: highlights view (diversified, per-source cap) is the
// default; /youtube/new is the strict-chronological archive.
export default function YouTubePage() {
  return (
    <TypeListingPage segment="youtube" sourceType="youtube" sort="highlights" />
  );
}
