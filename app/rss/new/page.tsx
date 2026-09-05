import TypeListingPage from "../../type-listing-page";

export const revalidate = 60;

// FID-2026-0904-014: strict-chronological archive, page 1.
export default function RssNewPage() {
  return (
    <TypeListingPage segment="rss" sourceType="rss" sort="strict" page={1} />
  );
}
