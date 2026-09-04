import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

// FID-2026-0904-012 item 6: no searchParams on cached routes — the page
// renders the merged category (opensource + trendshift) directly.
export default function GithubPage() {
  return (
    <TypeListingPage
      segment="github"
      sourceTypes={["opensource", "trendshift"]}
      page={1}
    />
  );
}
