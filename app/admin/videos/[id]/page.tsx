import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { formatBytes, formatDuration, timeAgo } from "@/lib/format";
import { thumbCandidateUrl, thumbUrl, videoUrl } from "@/lib/media/urls";
import { candidateList } from "@/lib/admin/server";
import { firstParam, idSchema } from "@/lib/admin/logic";
import { Alert, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { PageHeader, SectionTitle, StatCard, VideoStatusBadge, fmtDateTime } from "@/components/admin/ui";
import { CommentActions } from "@/components/admin/CommentActions";
import { ActionButton } from "@/components/admin/client";
import { VideoEditForm } from "@/components/admin/VideoEditForm";
import { ThumbnailManager } from "@/components/admin/ThumbnailManager";
import { deleteVideoAction } from "@/lib/admin/actions/videos";

export const metadata: Metadata = { title: "Edit video" };

export default async function AdminVideoEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const video = idSchema.safeParse(id).success
    ? await prisma.video.findUnique({ where: { id }, include: { models: { select: { modelId: true } } } })
    : null;

  if (!video) {
    return (
      <EmptyState
        icon="🔎"
        title="Video not found"
        reason="This video does not exist. It may have been deleted, or the link is wrong."
        actionHref="/admin/videos"
        actionLabel="Back to videos"
      />
    );
  }

  const [channels, series, models] = await Promise.all([
    prisma.channel.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.series.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    prisma.model.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const [likeCount, commentCount, deletedCommentCount, latestComments] = await Promise.all([
    prisma.videoLike.count({ where: { videoId: video.id } }),
    prisma.comment.count({ where: { videoId: video.id, deletedAt: null } }),
    prisma.comment.count({ where: { videoId: video.id, deletedAt: { not: null } } }),
    prisma.comment.findMany({
      where: { videoId: video.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, body: true, createdAt: true, user: { select: { id: true, name: true } } },
    }),
  ]);

  const candidates = candidateList(video.thumbCandidates);
  const listHref = video.type === "SHORT" ? "/admin/shorts" : "/admin/videos";

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href={listHref} className="text-muted hover:text-fg">
          ← Back to {video.type === "SHORT" ? "shorts" : "videos"}
        </Link>
      </p>
      <PageHeader
        title={video.title}
        description={`${video.type === "SHORT" ? "Short" : "Video"} · ${formatDuration(video.durationSec)} · ${formatBytes(video.sizeBytes)} · added ${fmtDateTime(video.createdAt)}`}
        actions={<VideoStatusBadge status={video.status} />}
      />

      {firstParam(sp.uploaded) === "1" ? (
        <div className="mb-5">
          <Alert tone="success">Upload complete. Fill in the details below, check the thumbnail, then set the status to Published.</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Views" value={video.views.toLocaleString("en-IN")} />
        <StatCard label="Likes" value={likeCount.toLocaleString("en-IN")} />
        <StatCard
          label="Comments"
          value={commentCount.toLocaleString("en-IN")}
          hint={deletedCommentCount ? `${deletedCommentCount} deleted` : undefined}
          href={`/admin/comments?video=${video.id}`}
        />
        <StatCard
          label="On the site"
          value={
            video.status === "PUBLISHED" ? (
              <Link href={`/watch/${video.slug}`} className="text-lg text-accent hover:underline">
                View ↗
              </Link>
            ) : (
              <span className="text-lg text-muted">Hidden</span>
            )
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-6">
        <VideoEditForm
          video={{
            id: video.id,
            title: video.title,
            slug: video.slug,
            description: video.description ?? "",
            type: video.type,
            status: video.status,
            channelId: video.channelId ?? "",
            seriesId: video.seriesId ?? "",
            episodeNo: video.episodeNo?.toString() ?? "",
            isFeatured: video.isFeatured,
            modelIds: video.models.map((m) => m.modelId),
          }}
          channels={channels}
          series={series.map((s) => ({ id: s.id, name: s.title }))}
          models={models}
        />

          <Card className="p-5">
            <SectionTitle
              action={
                commentCount + deletedCommentCount > 0 ? (
                  <Link href={`/admin/comments?video=${video.id}`} className="text-sm text-accent hover:underline">
                    Moderate all
                  </Link>
                ) : undefined
              }
            >
              Latest comments
            </SectionTitle>
            {latestComments.length === 0 ? (
              <p className="text-sm text-muted">
                {deletedCommentCount
                  ? "Every comment on this video has been deleted. Open “Moderate all” to review or restore them."
                  : "No comments yet. They appear here when subscribers comment on this video."}
              </p>
            ) : (
              <ul className="divide-y divide-line/60">
                {latestComments.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">
                        <Link href={`/admin/comments?user=${c.user.id}`} className="font-medium text-fg hover:underline">
                          {c.user.name}
                        </Link>{" "}
                        · {timeAgo(c.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg">{c.body}</p>
                    </div>
                    <CommentActions id={c.id} deleted={false} userId={c.user.id} authorName={c.user.name} showDeleteAll={false} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <ThumbnailManager
            videoId={video.id}
            currentUrl={thumbUrl(video)}
            hasThumb={Boolean(video.thumbPath)}
            candidateUrls={candidates.map((_, i) => thumbCandidateUrl(video.id, i))}
            currentCandidate={video.thumbPath ? candidates.indexOf(video.thumbPath) : -1}
            videoSrc={videoUrl(video.id)}
            vertical={video.type === "SHORT"}
          />

          <Card className="space-y-3 border-danger/30 p-5">
            <h2 className="text-base font-medium text-fg">Delete video</h2>
            <p className="text-sm text-muted">
              Removes the video, its short clip and all thumbnails from storage and frees {formatBytes(video.sizeBytes)}. This cannot be undone.
            </p>
            <ActionButton
              action={deleteVideoAction.bind(null, video.id, true)}
              variant="danger"
              size="md"
              confirm={`Delete "${video.title}" and all its files? This cannot be undone.`}
              confirmLabel="Yes, delete"
              pendingLabel="Deleting…"
            >
              Delete video
            </ActionButton>
          </Card>
        </div>
      </div>
    </>
  );
}
