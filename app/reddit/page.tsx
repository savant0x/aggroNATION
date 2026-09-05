import type { Metadata } from "next";

import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Reddit",
  description:
    "The hottest posts from curated subreddits — read on-site with no exits.",
};

export default function RedditPage() {
  return (
    <TypeListingPage segment="reddit" sourceType="reddit" sort="highlights" />
  );
}
