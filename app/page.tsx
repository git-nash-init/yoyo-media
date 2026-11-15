import { redirect } from "next/navigation";

/** The public landing page is not part of this repository, so the root sends visitors to the catalogue. */
export default function Home() {
  redirect("/browse");
}
