import type { Metadata } from "next";

import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "RSS Feeds",
  description:
    "The latest articles from curated RSS feeds — read in-site with full publisher content.",
};

export default function RssPage() {
  return <TypeListingPage segment="rss" sourceType="rss" sort="highlights" />;
}
