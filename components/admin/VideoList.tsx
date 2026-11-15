import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { formatDuration, timeAgo } from "@/lib/format";
import { thumbUrl } from "@/lib/media/urls";
import { z } from "zod";
import { PAGE_SIZE, buildQuery, firstParam, pageCount, parsePage } from "@/lib/admin/logic";
import { dateWhere, isRangeActive, parseDateRange, rangeParams } from "@/lib/admin/dateRange";
import { DateEmptyState, DateFilterBar, clearDateHref } from "@/components/admin/DateFilter";
import { Alert, Badge, ButtonLink, cn } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, Table, Td, Th, Thumb, VideoStatusBadge, fmtDateTime } from "@/components/admin/ui";
import { VideoRowActions } from "@/components/admin/VideoRowActions";

type SearchParams = Record<string, string | string[] | undefined>;

const byParam = z.enum(["added", "published"]);

/** Shared list for /admin/videos (LONG) and /admin/shorts (SHORT). */
export async function VideoList({ type, searchParams }: { type: "LONG" | "SHORT"; searchParams: SearchParams }) {
  await requireAdmin();

  const basePath = type === "SHORT" ? "/admin/shorts" : "/admin/videos";
  const noun = type === "SHORT" ? "shorts" : "videos";
  const q = firstParam(searchParams.q);
  const statusRaw = firstParam(searchParams.status);
  const status = statusRaw === "DRAFT" || statusRaw === "PUBLISHED" ? statusRaw : "";
  const channel = firstParam(searchParams.channel, 40);
  const page = parsePage(searchParams.page);
  const filtered = Boolean(q || status || channel);
  const range = parseDateRange(searchParams);
  const ranged = isRangeActive(range);
  // Which timestamp the date filter uses: when it was added (createdAt, default) or published (publishedAt).
  const by = byParam.safeParse(firstParam(searchParams.by, 10)).data ?? "added";
  const rp = rangeParams(range);
  const byP = by === "published" ? "published" : undefined;
  const keep = { ...rp, by: byP };

  const where: Prisma.VideoWhereInput = {
    type,
    ...dateWhere(by === "published" ? "publishedAt" : "createdAt", range),
    ...(q ? { title: { contains: q } } : {}),
    ...(status ? { status } : {}),
    ...(channel === "none" ? { channelId: null } : channel ? { channelId: channel } : {}),
  };

  const [total, videos, channels] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        status: true,
        durationSec: true,
        views: true,
        isFeatured: true,
        thumbPath: true,
        createdAt: true,
        publishedAt: true,
        updatedAt: true,
        channel: { select: { name: true } },
        _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
      },
    }),
    prisma.channel.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const pages = pageCount(total);

  return (
    <>
      <PageHeader
        title={type === "SHORT" ? "Shorts" : "Videos"}
        description={
          type === "SHORT"
            ? "Vertical clips of 90 seconds or less. Publish a draft to make it visible to subscribers."
            : "Full-length videos. Drafts arrive from YoYo Studio or the upload form; publish them when the details are ready."
        }
        actions={<ButtonLink href="/admin/videos/upload">Upload {type === "SHORT" ? "short" : "video"}</ButtonLink>}
      />

      {firstParam(searchParams.deleted) === "1" ? (
        <div className="mb-4">
          <Alert tone="success">Deleted. The video and its files were removed from storage.</Alert>
        </div>
      ) : null}

      <DateFilterBar
        range={range}
        caption={by === "published" ? "Filtered by publish date" : "Filtered by date added"}
        field={{ param: "by", value: by, options: [{ value: "added", label: "Added" }, { value: "published", label: "Published" }] }}
      />

      <FilterBar action={basePath} clearHref={filtered ? `${basePath}${buildQuery(keep)}` : undefined} keep={keep}>
        <FilterInput label="Search title" name="q" type="search" defaultValue={q} placeholder={`Search ${noun}…`} maxLength={100} />
        <FilterSelect label="Status" name="status" defaultValue={status}>
          <option value="">All</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
        </FilterSelect>
        <FilterSelect label="Channel" name="channel" defaultValue={channel}>
          <option value="">All channels</option>
          <option value="none">No channel</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {videos.length === 0 ? (
        ranged ? (
          <DateEmptyState
            noun={by === "published" ? `${noun} published` : `${noun} added`}
            range={range}
            alsoFiltered={filtered}
            clearHref={clearDateHref(basePath, { q, status, channel, by: byP })}
          />
        ) : filtered ? (
          <EmptyState
            icon="🔎"
            title={`No ${noun} match these filters`}
            reason="Nothing fits the search text, status and channel you picked. Clear the filters to see everything."
            actionHref={basePath}
            actionLabel="Clear filters"
          />
        ) : (
          <EmptyState
            title={`No ${noun} yet`}
            reason={`Nothing has been added so far. Push ${noun} from YoYo Studio, or upload a small file right here.`}
            actionHref="/admin/videos/upload"
            actionLabel={`Upload a ${type === "SHORT" ? "short" : "video"}`}
          />
        )
      ) : (
        <>
          <Table label={type === "SHORT" ? "Shorts" : "Videos"}>
            <thead>
              <tr>
                <Th>{type === "SHORT" ? "Short" : "Video"}</Th>
                <Th>Duration</Th>
                <Th>Status</Th>
                <Th className="text-right">Views</Th>
                <Th className="text-right">Likes</Th>
                <Th className="text-right">Comments</Th>
                <Th>{by === "published" ? "Published" : "Created"}</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id} className="hover:bg-surface-2/40">
                  <Td>
                    <Link href={`/admin/videos/${v.id}`} className="flex items-center gap-3">
                      <Thumb src={thumbUrl(v)} className={cn("h-12 shrink-0 rounded-md", type === "SHORT" ? "w-[1.7rem]" : "w-[5.3rem]")} />
                      <span className="min-w-0">
                        <span className="line-clamp-2 max-w-[18rem] font-medium text-fg">{v.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {v.channel?.name ?? "No channel"}
                          {v.isFeatured ? <Badge tone="brand">Featured</Badge> : null}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="tabular-nums text-muted">{formatDuration(v.durationSec)}</Td>
                  <Td>
                    <VideoStatusBadge status={v.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{v.views.toLocaleString("en-IN")}</Td>
                  <Td className="text-right tabular-nums">{v._count.likes.toLocaleString("en-IN")}</Td>
                  <Td className="text-right tabular-nums">
                    {v._count.comments > 0 ? (
                      <Link href={`/admin/comments?video=${v.id}`} className="text-accent hover:underline">
                        {v._count.comments.toLocaleString("en-IN")}
                      </Link>
                    ) : (
                      "0"
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {by === "published" ? (v.publishedAt ? <span title={fmtDateTime(v.publishedAt)}>{timeAgo(v.publishedAt)}</span> : "—") : <span title={fmtDateTime(v.createdAt)}>{timeAgo(v.createdAt)}</span>}
                  </Td>
                  <Td>
                    <VideoRowActions id={v.id} title={v.title} published={v.status === "PUBLISHED"} featured={v.isFeatured} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pages={pages} total={total} basePath={basePath} params={{ q, status, channel, ...keep }} />
        </>
      )}
    </>
  );
}
