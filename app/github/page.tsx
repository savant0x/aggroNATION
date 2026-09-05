import type { Metadata } from "next";

import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "GitHub",
  description:
    "Trending and newly-discovered open-source repositories from Trendshift and Open Source Projects — aggregated in-site.",
};

export default function GithubPage() {
  return (
    <TypeListingPage
      segment="github"
      sourceTypes={["opensource", "trendshift"]}
      sort="highlights"
    />
  );
}
