import TypeListingPage from "../../type-listing-page";

export const revalidate = 60;

// FID-2026-0904-014: strict-chronological archive, page 1.
export default function OpenSourceNewPage() {
  return (
    <TypeListingPage
      segment="opensource"
      sourceType="opensource"
      sort="strict"
      page={1}
    />
  );
}
