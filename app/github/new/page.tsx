import TypeListingPage from "../../type-listing-page";

export const revalidate = 60;

// FID-2026-0904-014: strict-chronological archive, page 1 (merged category).
export default function GithubNewPage() {
  return (
    <TypeListingPage
      segment="github"
      sourceTypes={["opensource", "trendshift"]}
      sort="strict"
      page={1}
    />
  );
}
