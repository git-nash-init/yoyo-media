import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { VideoList } from "@/components/admin/VideoList";

export const metadata: Metadata = { title: "Shorts" };

export default async function AdminShortsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return <VideoList type="SHORT" searchParams={await searchParams} />;
}
