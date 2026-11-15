import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { storage } from "@/lib/storage";
import { formatBytes, formatDuration, formatINR, timeAgo } from "@/lib/format";
import { thumbUrl } from "@/lib/media/urls";
import { STORAGE_CAP_BYTES, buildQuery } from "@/lib/admin/logic";
import {
  ALL_TIME_CHART_DAYS,
  RANGE_LABELS,
  bucketsFor,
  compareText,
  dateWhere,
  fillBuckets,
  isRangeActive,
  parseDateRange,
  previousPeriod,
  rangeParams,
  rangePhrase,
} from "@/lib/admin/dateRange";
import { ButtonLink, Card, cn } from "@/components/ui";
import { DateEmptyLine, DateFilterBar } from "@/components/admin/DateFilter";
import { BarChart, PageHeader, PaymentStatusBadge, SectionTitle, StatCard, Thumb } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Record<string, string | string[] | undefined>;

const UNIT_WORD = { hour: "by hour", day: "by day", month: "by month", year: "by year" } as const;

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const now = new Date();
  const range = parseDateRange(await searchParams, now);
  const ranged = isRangeActive(range);
  const created = dateWhere("createdAt", range);
  const chart = bucketsFor(range, now);
  const chartWindow = { gte: chart.start, lt: chart.end };
  const cmp = previousPeriod(range, now);
  const rp = rangeParams(range);
  const q = (extra: Record<string, string | undefined> = {}) => buildQuery({ ...extra, ...rp });

  const [
    users,
    prevUsers,
    activeSubscribers,
    revenue,
    prevRevenue,
    subsStarted,
    videosPublished,
    shortsPublished,
    draftCount,
    usedBytes,
    signupRows,
    paidRows,
    recentUsers,
    recentPayments,
    draftVideos,
    likes,
    comments,
    topShortLikes,
  ] = await Promise.all([
    prisma.user.count({ where: created }),
    cmp ? prisma.user.count({ where: { createdAt: cmp.previous } }) : null,
    // Point in time ("Now"): ignores the date filter.
    prisma.user.count({ where: { subscriptions: { some: { status: "ACTIVE", expiresAt: { gt: now } } } } }),
    prisma.payment.aggregate({ where: { status: "PAID", ...dateWhere("paidAt", range) }, _sum: { amountPaise: true }, _count: true }),
    cmp ? prisma.payment.aggregate({ where: { status: "PAID", paidAt: cmp.previous }, _sum: { amountPaise: true } }) : null,
    prisma.subscription.count({ where: { status: { not: "CANCELLED" }, ...dateWhere("startsAt", range) } }),
    prisma.video.count({ where: { type: "LONG", status: "PUBLISHED", ...dateWhere("publishedAt", range) } }),
    prisma.video.count({ where: { type: "SHORT", status: "PUBLISHED", ...dateWhere("publishedAt", range) } }),
    prisma.video.count({ where: { status: "DRAFT", ...created } }),
    storage.usage(),
    prisma.user.findMany({ where: { createdAt: chartWindow }, select: { createdAt: true } }),
    prisma.payment.findMany({ where: { status: "PAID", paidAt: chartWindow }, select: { paidAt: true, amountPaise: true } }),
    prisma.user.findMany({ where: created, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, name: true, email: true, createdAt: true } }),
    prisma.payment.findMany({
      where: created,
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, amountPaise: true, status: true, createdAt: true, user: { select: { id: true, name: true } } },
    }),
    prisma.video.findMany({
      where: { status: "DRAFT", ...created },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, type: true, durationSec: true, thumbPath: true, updatedAt: true, createdAt: true },
    }),
    prisma.videoLike.count({ where: created }),
    prisma.comment.count({ where: { deletedAt: null, ...created } }),
    // Likes received in the range, counted per short.
    prisma.videoLike.groupBy({
      by: ["videoId"],
      where: { ...created, video: { type: "SHORT" } },
      _count: { videoId: true },
      orderBy: { _count: { videoId: "desc" } },
      take: 5,
    }),
  ]);

  const topShortRows = topShortLikes.length
    ? await prisma.video.findMany({
        where: { id: { in: topShortLikes.map((r) => r.videoId) } },
        select: { id: true, title: true, thumbPath: true, updatedAt: true, views: true },
      })
    : [];
  const topShorts = topShortLikes.flatMap((r) => {
    const video = topShortRows.find((v) => v.id === r.videoId);
    return video ? [{ video, likes: r._count.videoId }] : [];
  });

  const signups = fillBuckets(chart.buckets, signupRows, (u) => u.createdAt);
  const revenueByBucket = fillBuckets(chart.buckets, paidRows, (p) => p.paidAt, (p) => p.amountPaise);
  const chartTitle = ranged ? range.label : `Last ${ALL_TIME_CHART_DAYS} days`;
  const chartPeriod = `${ranged ? (range.key === "custom" ? rangePhrase(range) : RANGE_LABELS[range.key].toLowerCase()) : `in the last ${ALL_TIME_CHART_DAYS} days`}, ${UNIT_WORD[chart.unit]}`;
  const usedPct = Math.min(100, (usedBytes / STORAGE_CAP_BYTES) * 100);
  const storageTone = usedPct >= 90 ? "bg-danger" : usedPct >= 75 ? "bg-warning" : "bg-brand";
  const revenueSum = revenue._sum.amountPaise ?? 0;
  const emptyLine = (noun: string) => <DateEmptyLine noun={noun} range={range} clearHref="/admin" />;
  const publishedQuery = (extra: Record<string, string>) => q({ status: "PUBLISHED", ...(ranged ? { by: "published" } : {}), ...extra });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`How YoYo Videos is doing`}
        actions={
          <ButtonLink href="/admin/videos/upload" size="md">
            Upload video
          </ButtonLink>
        }
      />

      <DateFilterBar range={range} caption="Each number uses its own date: sign-up, payment, publish, like or comment time. Cards marked Now ignore it." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={ranged ? "New users" : "Total users"}
          value={users.toLocaleString("en-IN")}
          hint={cmp && prevUsers !== null ? compareText(users, prevUsers) : "Accounts created"}
          href={`/admin/subscribers${q()}`}
        />
        <StatCard label="Active subscribers" badge="Now" value={activeSubscribers.toLocaleString("en-IN")} hint="Active plan right now" href="/admin/subscribers?filter=active" />
        <StatCard
          label="Revenue"
          value={formatINR(revenueSum)}
          hint={`${revenue._count} paid${cmp && prevRevenue ? ` · ${compareText(revenueSum, prevRevenue._sum.amountPaise ?? 0)}` : " payments"}`}
          href={`/admin/payments${q({ status: "PAID" })}`}
        />
        <StatCard label="Subscriptions started" value={subsStarted.toLocaleString("en-IN")} hint="Paid or granted, not cancelled" />
        <StatCard label="Videos published" value={videosPublished.toLocaleString("en-IN")} href={`/admin/videos${publishedQuery({})}`} />
        <StatCard label="Shorts published" value={shortsPublished.toLocaleString("en-IN")} href={`/admin/shorts${publishedQuery({})}`} />
        <StatCard label={ranged ? "Likes" : "Total likes"} value={likes.toLocaleString("en-IN")} hint="On videos and shorts" />
        <StatCard label={ranged ? "Comments" : "Total comments"} value={comments.toLocaleString("en-IN")} hint="Visible to viewers" href={`/admin/comments${q({ state: "visible" })}`} />
      </div>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-medium text-fg">
            Storage used
            <span className="rounded-lg border border-line bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted">Now</span>
          </h2>
          <p className="text-sm text-muted">
            <span className="font-medium text-fg">{formatBytes(usedBytes)}</span> of {formatBytes(STORAGE_CAP_BYTES)} used ({usedPct.toFixed(1)}%)
          </p>
        </div>
        <div
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usedPct)}
        >
          <div className={cn("h-full rounded-full", storageTone)} style={{ width: `${Math.max(usedPct, usedBytes > 0 ? 1 : 0)}%` }} />
        </div>
        {usedPct >= 90 ? (
          <p className="mt-2 text-sm text-danger">Storage is almost full. Delete unused drafts or old videos before uploading more.</p>
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Signups · {chartTitle}</SectionTitle>
          <BarChart data={signups} label="Signups" period={chartPeriod} />
        </Card>
        <Card className="p-5">
          <SectionTitle>Revenue · {chartTitle}</SectionTitle>
          <BarChart data={revenueByBucket} label="Revenue" format={formatINR} tone="success" period={chartPeriod} />
        </Card>
      </div>
      <p className="mt-2 text-xs text-muted">
        Charts are grouped {UNIT_WORD[chart.unit]} in India time (IST).{chart.note ? ` ${chart.note}` : ""}
      </p>

      <Card className="mt-4 p-5">
        <SectionTitle action={<Link href="/admin/shorts" className="text-sm text-accent hover:underline">All shorts</Link>}>
          Top 5 shorts by likes{ranged ? ` received ${rangePhrase(range)}` : ""}
        </SectionTitle>
        {topShorts.length === 0 ? (
          ranged ? (
            emptyLine("likes on shorts")
          ) : (
            <p className="text-sm text-muted">No short has been liked yet. The most-liked shorts appear here once viewers start liking them.</p>
          )
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {topShorts.map(({ video: v, likes: likeCount }, i) => (
              <li key={v.id}>
                <Link href={`/admin/videos/${v.id}`} className="flex items-center gap-3 rounded-xl p-1 hover:bg-surface-2">
                  <span className="w-4 shrink-0 text-center text-sm font-medium tabular-nums text-muted">{i + 1}</span>
                  <Thumb src={thumbUrl(v)} className="h-14 w-8 shrink-0 rounded-md" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium text-fg">{v.title}</span>
                    <span className="block text-xs text-muted">
                      {likeCount.toLocaleString("en-IN")} likes · {v.views.toLocaleString("en-IN")} views
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle action={<Link href={`/admin/videos${q({ status: "DRAFT" })}`} className="text-sm text-accent hover:underline">View all</Link>}>
            Drafts awaiting publish{draftCount ? ` (${draftCount.toLocaleString("en-IN")})` : ""}
          </SectionTitle>
          {draftVideos.length === 0 ? (
            ranged ? (
              emptyLine("drafts added")
            ) : (
              <p className="text-sm text-muted">
                No drafts. Videos pushed from YoYo Studio or uploaded here land in this list until you publish them.
              </p>
            )
          ) : (
            <ul className="space-y-3">
              {draftVideos.map((v) => (
                <li key={v.id}>
                  <Link href={`/admin/videos/${v.id}`} className="flex items-center gap-3 rounded-xl p-1 hover:bg-surface-2">
                    <Thumb src={thumbUrl(v)} className={cn("h-10 shrink-0 rounded-md", v.type === "SHORT" ? "w-7" : "w-[4.5rem]")} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{v.title}</span>
                      <span className="block text-xs text-muted">
                        {v.type === "SHORT" ? "Short" : "Video"} · {formatDuration(v.durationSec)} · {timeAgo(v.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle action={<Link href={`/admin/subscribers${q()}`} className="text-sm text-accent hover:underline">View all</Link>}>
            Recent signups
          </SectionTitle>
          {recentUsers.length === 0 ? (
            ranged ? (
              emptyLine("signups")
            ) : (
              <p className="text-sm text-muted">Nobody has signed up yet. New accounts will appear here.</p>
            )
          ) : (
            <ul className="space-y-3">
              {recentUsers.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/subscribers/${u.id}`} className="block rounded-xl p-1 hover:bg-surface-2">
                    <span className="block truncate text-sm font-medium text-fg">{u.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {u.email} · {timeAgo(u.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle action={<Link href={`/admin/payments${q()}`} className="text-sm text-accent hover:underline">View all</Link>}>
            Recent payments
          </SectionTitle>
          {recentPayments.length === 0 ? (
            ranged ? (
              emptyLine("payments")
            ) : (
              <p className="text-sm text-muted">No payments yet. They appear here as soon as someone checks out.</p>
            )
          ) : (
            <ul className="space-y-3">
              {recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/subscribers/${p.user.id}`} className="min-w-0 rounded-xl p-1 hover:bg-surface-2">
                    <span className="block truncate text-sm font-medium text-fg">{p.user.name}</span>
                    <span className="block text-xs text-muted">
                      {formatINR(p.amountPaise)} · {timeAgo(p.createdAt)}
                    </span>
                  </Link>
                  <PaymentStatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
