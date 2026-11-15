import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChannelChips } from "@/components/video/ChannelChips";
import { FollowButton } from "@/components/video/FollowButton";
import { Pagination } from "@/components/video/Pagination";
import { VideoGrid } from "@/components/video/VideoGrid";
import { EmptyState } from "@/components/states";
import { getCurrentUser } from "@/lib/auth/session";
import { getChannelBySlug, listChannels } from "@/lib/queries/catalog";
import { isFollowingChannel } from "@/lib/queries/follows";
import { parsePage } from "@/lib/queries/pagination";
import { listChannelVideos } from "@/lib/queries/videos";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const channel = await getChannelBySlug((await params).slug);
  return channel
    ? { title: channel.name, description: channel.description?.slice(0, 160) ?? `Videos from ${channel.name}.` }
    : { title: "Channel not found" };
}

export default async function ChannelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const channel = await getChannelBySlug(slug);
  if (!channel) notFound();

  const page = parsePage((await searchParams).page);
  const user = await getCurrentUser();
  const [videos, following, channels] = await Promise.all([
    listChannelVideos(channel.id, page),
    isFollowingChannel(user?.id, channel.id),
    listChannels(),
  ]);
  const path = `/channel/${channel.slug}`;

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-5 lg:px-6">
      <ChannelChips channels={channels} activeSlug={channel.slug} />

      <header className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={channel.logo}
          alt=""
          width={112}
          height={112}
          decoding="async"
          className="h-20 w-20 shrink-0 rounded-full bg-surface-2 object-cover ring-2 ring-line sm:h-28 sm:w-28"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl text-fg sm:text-4xl">{channel.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {channel.videoCount} {channel.videoCount === 1 ? "video" : "videos"}
            <span aria-hidden="true"> · </span>
            {channel.followerCount} {channel.followerCount === 1 ? "follower" : "followers"}
          </p>
          {channel.description ? (
            <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-fg/90">{channel.description}</p>
          ) : null}
        </div>
        <FollowButton
          kind="channel"
          targetId={channel.id}
          name={channel.name}
          initialFollowing={following}
          signedIn={!!user}
          loginNext={path}
          size="lg"
        />
      </header>

      {videos.info.total === 0 ? (
        <EmptyState
          title="No videos yet"
          reason={`${channel.name} has not published anything yet. New videos are added by our team.`}
          actionHref="/browse"
          actionLabel="Browse all videos"
        />
      ) : (
        <section aria-label={`Videos from ${channel.name}`}>
          <VideoGrid videos={videos.items} showChannel={false} />
          <Pagination page={videos.info.page} totalPages={videos.info.totalPages} basePath={path} />
        </section>
      )}
    </div>
  );
}
