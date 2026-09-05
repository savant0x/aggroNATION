import type { Metadata } from "next";

import TypeListingPage from "@/app/type-listing-page";

export const metadata: Metadata = {
  title: "Open Source Projects",
  description:
    "Newly-discovered open-source projects from Open Source Projects — aggregated in-site.",
};

export const revalidate = 60;

export default function OpenSourcePage() {
  return (
    <TypeListingPage
      segment="opensource"
      sourceType="opensource"
      sort="highlights"
    />
  );
}
