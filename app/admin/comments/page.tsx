import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { timeAgo } from "@/lib/format";
import { PAGE_SIZE, buildQuery, firstParam, idSchema, pageCount, parsePage } from "@/lib/admin/logic";
import { dateWhere, isRangeActive, parseDateRange, rangeParams } from "@/lib/admin/dateRange";
import { DateEmptyState, DateFilterBar, clearDateHref } from "@/components/admin/DateFilter";
import { Alert, Badge, cn } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, StatCard, Table, Td, Th, fmtDateTime } from "@/components/admin/ui";
import { CommentActions, DeleteAllByUserButton } from "@/components/admin/CommentActions";

export const metadata: Metadata = { title: "Comments" };

export default async function AdminCommentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const stateRaw = firstParam(sp.state);
  const state = stateRaw === "visible" || stateRaw === "deleted" ? stateRaw : "";
  const videoRaw = firstParam(sp.video, 40);
  const video = idSchema.safeParse(videoRaw).success ? videoRaw : "";
  const userRaw = firstParam(sp.user, 40);
  const user = idSchema.safeParse(userRaw).success ? userRaw : "";
  const page = parsePage(sp.page);
  const filtered = Boolean(q || state || video || user);
  const range = parseDateRange(sp);
  const ranged = isRangeActive(range);
  const rp = rangeParams(range);
  const created: Prisma.CommentWhereInput = dateWhere("createdAt", range);

  const where: Prisma.CommentWhereInput = {
    ...created,
    ...(q ? { body: { contains: q } } : {}),
    ...(state === "visible" ? { deletedAt: null } : state === "deleted" ? { deletedAt: { not: null } } : {}),
    ...(video ? { videoId: video } : {}),
    ...(user ? { userId: user } : {}),
  };

  const [visibleCount, deletedCount, total, comments, videoOptions, filterUser] = await Promise.all([
    prisma.comment.count({ where: { ...created, deletedAt: null } }),
    prisma.comment.count({ where: { ...created, deletedAt: { not: null } } }),
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        body: true,
        createdAt: true,
        deletedAt: true,
        user: { select: { id: true, name: true, email: true } },
        video: { select: { id: true, title: true, slug: true, status: true, type: true } },
      },
    }),
    // Only videos that actually have comments, most recent first, for the filter dropdown.
    prisma.video.findMany({
      where: { comments: { some: {} } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, title: true, type: true },
    }),
    user ? prisma.user.findUnique({ where: { id: user }, select: { id: true, name: true, email: true } }) : null,
  ]);

  return (
    <>
      <PageHeader title="Comments" description="Everything viewers have written under videos and shorts, newest first. Deleting hides a comment from viewers; it can be restored." />

      <DateFilterBar range={range} caption="Filtered by the time the comment was written" />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Visible" value={visibleCount.toLocaleString("en-IN")} href={`/admin/comments${buildQuery({ state: "visible", ...rp })}`} />
        <StatCard label="Deleted" value={deletedCount.toLocaleString("en-IN")} href={`/admin/comments${buildQuery({ state: "deleted", ...rp })}`} />
        <StatCard label="Total" value={(visibleCount + deletedCount).toLocaleString("en-IN")} />
      </div>

      {filterUser ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
          <p className="text-muted">
            Showing comments by{" "}
            <Link href={`/admin/subscribers/${filterUser.id}`} className="font-medium text-fg hover:underline">
              {filterUser.name}
            </Link>{" "}
            ({filterUser.email})
          </p>
          <DeleteAllByUserButton userId={filterUser.id} authorName={filterUser.name} size="sm" />
        </div>
      ) : user ? (
        <div className="mb-4">
          <Alert tone="warning">That user no longer exists, so they have no comments.</Alert>
        </div>
      ) : null}

      <FilterBar action="/admin/comments" clearHref={filtered ? `/admin/comments${buildQuery(rp)}` : undefined} keep={rp}>
        {user ? <input type="hidden" name="user" value={user} /> : null}
        <FilterInput label="Search comment text" name="q" type="search" defaultValue={q} placeholder="Search comments…" maxLength={100} />
        <FilterSelect label="Show" name="state" defaultValue={state}>
          <option value="">All</option>
          <option value="visible">Visible</option>
          <option value="deleted">Deleted</option>
        </FilterSelect>
        <FilterSelect label="Video" name="video" defaultValue={video}>
          <option value="">All videos</option>
          {videoOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.type === "SHORT" ? "Short: " : ""}
              {v.title.slice(0, 60)}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {comments.length === 0 ? (
        ranged ? (
          <DateEmptyState noun="comments" range={range} alsoFiltered={filtered} clearHref={clearDateHref("/admin/comments", { q, state, video, user })} />
        ) : filtered ? (
          <EmptyState icon="🔎" title="No comments match these filters" reason="Nothing fits the text, state and video you picked. Clear the filters to see every comment." actionHref="/admin/comments" actionLabel="Clear filters" />
        ) : (
          <EmptyState icon="💬" title="No comments yet" reason="Subscribers have not commented on anything so far. Comments show up here as soon as someone writes one." actionHref="/admin/videos" actionLabel="Go to videos" />
        )
      ) : (
        <>
          <Table label="Comments">
            <thead>
              <tr>
                <Th>Comment</Th>
                <Th>Author</Th>
                <Th>Video</Th>
                <Th>Time</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/40">
                  <Td className="max-w-[24rem]">
                    <p className={cn("whitespace-pre-wrap break-words", c.deletedAt && "text-muted line-through")}>{c.body}</p>
                    {c.deletedAt ? (
                      <span className="mt-1 inline-flex items-center gap-2 text-xs text-muted">
                        <Badge tone="danger">Deleted</Badge> {fmtDateTime(c.deletedAt)}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Link href={`/admin/comments?user=${c.user.id}`} className="block max-w-[12rem] hover:underline" title="Show all comments by this user">
                      <span className="block truncate font-medium text-fg">{c.user.name}</span>
                      <span className="block truncate text-xs text-muted">{c.user.email}</span>
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/admin/videos/${c.video.id}`} className="line-clamp-2 max-w-[14rem] font-medium text-fg hover:underline">
                      {c.video.title}
                    </Link>
                    {c.video.status === "PUBLISHED" ? (
                      <Link href={`/watch/${c.video.slug}`} className="text-xs text-accent hover:underline">
                        View on site ↗
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">Not published</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted" >
                    <span title={fmtDateTime(c.createdAt)}>{timeAgo(c.createdAt)}</span>
                  </Td>
                  <Td>
                    <CommentActions id={c.id} deleted={Boolean(c.deletedAt)} userId={c.user.id} authorName={c.user.name} showDeleteAll={!user} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pages={pageCount(total)} total={total} basePath="/admin/comments" params={{ q, state, video, user, ...rp }} />
        </>
      )}
    </>
  );
}
