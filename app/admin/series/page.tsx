import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { TaxonomyListPage } from "@/components/admin/Taxonomy";

export const metadata: Metadata = { title: "Series" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return <TaxonomyListPage kind="series" searchParams={await searchParams} />;
}
