import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { TaxonomyNewPage } from "@/components/admin/Taxonomy";

export const metadata: Metadata = { title: "New channel" };

export default async function Page() {
  await requireAdmin();
  return <TaxonomyNewPage kind="channel" />;
}
