import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export default function HuggingFacePage() {
  return (
    <TypeListingPage segment="huggingface" sourceType="huggingface" page={1} />
  );
}
