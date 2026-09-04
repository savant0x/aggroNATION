import TypeListingPage from "../type-listing-page";

export const revalidate = 60;

export default function YouTubePage() {
  return <TypeListingPage segment="youtube" sourceType="youtube" page={1} />;
}
