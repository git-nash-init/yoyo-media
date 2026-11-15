import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/admin/ui";
import { UploadForm } from "@/components/admin/UploadForm";

export const metadata: Metadata = { title: "Upload video" };

export default async function AdminUploadPage() {
  await requireAdmin();
  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/videos" className="text-muted hover:text-fg">
          ← Back to videos
        </Link>
      </p>
      <PageHeader title="Upload video" description="Quick upload for small files, straight from the browser. The video is saved as a draft so you can add details before publishing." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <UploadForm />
        <Card className="h-fit space-y-3 p-5 text-sm text-muted">
          <h2 className="text-base font-medium text-fg">Bigger than 500 MB?</h2>
          <p>
            Use <span className="font-medium text-fg">YoYo Studio</span> on your PC instead. It compresses the video, makes the preview clip and thumbnail candidates, and resumes if the connection drops.
          </p>
          <p>Browser uploads are sent as-is: no compression, no preview clip, and they restart from zero if interrupted.</p>
          <Link href="/admin/ingest" className="inline-block font-medium text-accent hover:underline">
            Set up YoYo Studio →
          </Link>
        </Card>
      </div>
    </>
  );
}
