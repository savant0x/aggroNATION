import TypeListingPage from "../../type-listing-page";

export const revalidate = 60;

// FID-2026-0904-014: strict-chronological archive, page 1.
export default function HuggingFaceNewPage() {
  return (
    <TypeListingPage
      segment="huggingface"
      sourceType="huggingface"
      sort="strict"
      page={1}
    />
  );
}
