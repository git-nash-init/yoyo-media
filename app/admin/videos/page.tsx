import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { VideoList } from "@/components/admin/VideoList";

export const metadata: Metadata = { title: "Videos" };

export default async function AdminVideosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  return <VideoList type="LONG" searchParams={await searchParams} />;
}
