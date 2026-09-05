import type { Metadata } from "next";

import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "HuggingFace",
  description:
    "Today's curated AI papers from HuggingFace Daily — aggregated in-site.",
};

export default function HuggingFacePage() {
  return (
    <TypeListingPage
      segment="huggingface"
      sourceType="huggingface"
      sort="highlights"
    />
  );
}
