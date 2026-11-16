import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon, LockIcon } from "@/components/shell/icons";
import { WatchActions, WatchComments } from "@/components/engagement/WatchEngagement";
import { FollowButton } from "@/components/video/FollowButton";
import { Player } from "@/components/video/Player";
import { SectionHeading, VideoGrid, VideoRow } from "@/components/video/VideoGrid";
import { watermarkFromSettings } from "@/components/video/Watermark";
import { PermissionDenied } from "@/components/states";
import { buttonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEngagement } from "@/lib/engagement/queries";
import { formatINR } from "@/lib/format";
import { downloadUrl, videoUrl } from "@/lib/media/urls";
import { isFollowingChannel } from "@/lib/queries/follows";
import { getWatchPosition, getWatchVideo, listMoreLikeThis, listSeriesEpisodes } from "@/lib/queries/videos";
import { rateLimit } from "@/lib/security/ratelimit";
import { getPlan, getSettings } from "@/lib/settings";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const video = await getWatchVideo((await params).slug);
  return video
    ? { title: video.title, description: video.description?.slice(0, 160) ?? `Watch ${video.title} on YoYo Videos.` }
    : { title: "Video not found" };
}

/** `?t=` = seconds to start from (used when returning from sign-in). */
function parseStart(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !/^\d{1,6}$/.test(v)) return null;
  return Number(v);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const viewsFmt = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export default async function WatchPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const video = await getWatchVideo(slug);
  if (!video) notFound();

  const user = await getCurrentUser();
  const canWatch = !!user?.isSubscriber;
  const path = `/watch/${video.slug}`;
  const next = encodeURIComponent(path);

  const [settings, plan, episodes, more, followingChannel, savedPosition, engagementMap] = await Promise.all([
    getSettings(),
    canWatch ? Promise.resolve(null) : getPlan(),
    video.seriesId ? listSeriesEpisodes(video.seriesId) : Promise.resolve([]),
    listMoreLikeThis(video, 60),
    video.channel ? isFollowingChannel(user?.id, video.channel.id) : Promise.resolve(false),
    canWatch && user ? getWatchPosition(user.id, video.id) : Promise.resolve(0),
    getEngagement([video.id], user?.id ?? null),
  ]);
  const engagement = engagementMap.get(video.id) ?? { likeCount: 0, commentCount: 0, liked: false };
  const viewer = { signedIn: !!user, isSubscriber: canWatch };

  // Count a view at most once per user per video per hour (only for people who can actually play it).
  let views = video.views;
  if (canWatch && user) {
    const rl = await rateLimit(`view:${user.id}:${video.id}`, 1, 3600);
    if (rl.ok) {
      await prisma.video.updateMany({
        where: { id: video.id, status: "PUBLISHED" },
        data: { views: { increment: 1 } },
      });
      views += 1;
    }
  }

  const startAt = parseStart((await searchParams).t) ?? savedPosition;
  const price = plan ? formatINR(plan.pricePaise) : "";
  const hasSeries = episodes.length > 1;
  const sidebar = hasSeries ? episodes : more;

  return (
    <div className="mx-auto max-w-[1600px] px-0 py-0 sm:px-4 sm:py-5 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {/* Player or paywall. The stream URL is only ever rendered for subscribers. */}
          {canWatch ? (
            <Player
              key={video.id}
              videoId={video.id}
              slug={video.slug}
              title={video.title}
              src={videoUrl(video.id)}
              poster={video.thumb}
              previewSrc={video.preview}
              durationSec={video.durationSec}
              initialPosition={startAt}
              watermark={watermarkFromSettings(settings)}
              subscribeHref={`/subscribe?next=${next}`}
            />
          ) : (
            <div className="relative isolate overflow-hidden bg-surface sm:rounded-xl sm:ring-1 sm:ring-line md:aspect-video md:min-h-72">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={video.thumb}
                alt=""
                width={1280}
                height={720}
                decoding="async"
                className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40 light:opacity-30"
              />
              {/* Page-coloured scrim: the lock message below uses theme text colours. */}
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/70 to-bg/40" aria-hidden="true" />
              <div className="flex h-full min-h-72 items-center justify-center [&>div]:py-8">
                {user ? (
                  <PermissionDenied
                    title="Subscribe to watch"
                    reason={`You are signed in, but watching needs an active plan. One plan covers every video, shorts and downloads.`}
                    actionHref={`/subscribe?next=${next}`}
                    actionLabel={`Subscribe for ${price}`}
                  />
                ) : (
                  <PermissionDenied
                    title="Subscribe to watch"
                    reason={`Watching is for subscribers. Create an account and subscribe for ${price} to watch every video.`}
                    actionHref={`/register?next=${next}`}
                    actionLabel="Subscribe to watch"
                    secondaryHref={`/login?next=${next}`}
                    secondaryLabel="Sign in"
                  />
                )}
              </div>
            </div>
          )}

          <div className="px-4 pt-4 sm:px-0">
            {video.series ? (
              <p className="mb-1 text-sm font-medium text-accent">
                <Link href={`/series/${video.series.slug}`} className="hover:underline">
                  {video.series.title}
                </Link>
                {video.episodeNo != null ? <span className="text-muted"> · Episode {video.episodeNo}</span> : null}
              </p>
            ) : null}
            <h1 className="text-xl font-medium leading-tight text-fg sm:text-2xl">{video.title}</h1>
            <p className="mt-1.5 text-sm text-muted">
              {viewsFmt.format(views)} {views === 1 ? "view" : "views"}
              {video.publishedAt ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <time dateTime={video.publishedAt.toISOString()}>{dateFmt.format(video.publishedAt)}</time>
                </>
              ) : null}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
              {video.channel ? (
                <div className="flex min-w-0 items-center gap-3">
                  <Link href={`/channel/${video.channel.slug}`} className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.channel.logo}
                      alt=""
                      width={44}
                      height={44}
                      decoding="async"
                      className="h-11 w-11 shrink-0 rounded-full bg-surface-2 object-cover"
                    />
                    <span className="truncate text-base font-medium text-fg hover:text-accent">{video.channel.name}</span>
                  </Link>
                  <FollowButton
                    kind="channel"
                    targetId={video.channel.id}
                    name={video.channel.name}
                    initialFollowing={followingChannel}
                    signedIn={!!user}
                    loginNext={path}
                    size="sm"
                  />
                </div>
              ) : (
                <span />
              )}

              <div className="flex flex-wrap items-start gap-2">
                <WatchActions videoId={video.id} title={video.title} path={path} initial={engagement} viewer={viewer} />
                {canWatch ? (
                  <a href={downloadUrl(video.id)} download className={buttonClass("secondary", "md")}>
                    <DownloadIcon size={18} />
                    Download
                  </a>
                ) : (
                  <Link
                    href={user ? `/subscribe?next=${next}` : `/register?next=${next}`}
                    className={buttonClass("secondary", "md")}
                  >
                    <LockIcon size={16} />
                    Subscribe to download
                  </Link>
                )}
              </div>
            </div>

            {video.models.length > 0 ? (
              <div className="mt-4">
                <h2 className="mb-2 text-xs font-medium text-muted">Featuring</h2>
                <ul className="flex flex-wrap gap-2">
                  {video.models.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/models/${m.slug}`}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface-2 pl-1.5 pr-3.5 text-sm font-medium text-fg hover:bg-line"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.photo}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          decoding="async"
                          className="h-7 w-7 rounded-full bg-surface object-cover"
                        />
                        {m.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {video.description ? (
              <div className="mt-4 rounded-2xl bg-surface p-4">
                <h2 className="sr-only">Description</h2>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-fg/90">{video.description}</p>
              </div>
            ) : null}

            <WatchComments
              videoId={video.id}
              path={path}
              initialCount={engagement.commentCount}
              viewer={viewer}
              viewerName={user?.name ?? null}
            />
          </div>
        </div>

        {/* Sidebar: series episodes when in a series, otherwise related videos */}
        {sidebar.length > 0 ? (
          <aside className="min-w-0 px-2 sm:px-0" aria-labelledby="upnext-heading">
            <h2 id="upnext-heading" className="mb-2 px-2 text-lg font-medium text-fg">
              {hasSeries ? (video.series ? `${video.series.title} · Episodes` : "Episodes") : "More like this"}
            </h2>
            <div className={hasSeries ? "max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-surface p-1" : ""}>
              {sidebar.map((v) => (
                <VideoRow key={v.id} video={v} current={v.id === video.id} />
              ))}
            </div>
          </aside>
        ) : null}
      </div>

      {hasSeries && more.length > 0 ? (
        <section className="mt-10 px-4 pb-6 sm:px-0">
          <SectionHeading title="More like this" />
          <VideoGrid videos={more} />
        </section>
      ) : (
        <div className="pb-6" />
      )}
    </div>
  );
}
