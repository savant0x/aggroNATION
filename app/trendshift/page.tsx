import type { Metadata } from "next";

import TypeListingPage from "../type-listing-page";

export const metadata: Metadata = {
  title: "Trendshift",
  description:
    "Trending open-source repositories from Trendshift — aggregated in-site.",
};

export const revalidate = 60;

export default function TrendshiftPage() {
  return (
    <TypeListingPage
      segment="trendshift"
      sourceType="trendshift"
      sort="highlights"
    />
  );
}
