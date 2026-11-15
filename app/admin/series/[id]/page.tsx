import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { TaxonomyEditPage } from "@/components/admin/Taxonomy";

export const metadata: Metadata = { title: "Edit series" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <TaxonomyEditPage kind="series" id={id} />;
}
