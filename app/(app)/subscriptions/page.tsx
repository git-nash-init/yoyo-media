import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/video/Pagination";
import { VideoGrid } from "@/components/video/VideoGrid";
import { EmptyState } from "@/components/states";
import { requireUser } from "@/lib/auth/guards";
import { listFollowing, listFollowingFeed } from "@/lib/queries/follows";
import { parsePage } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await requireUser("/subscriptions");
  const page = parsePage((await searchParams).page);

  // Both queries are scoped to the session user's id.
  const following = await listFollowing(user.id);
  const nothingFollowed = following.channels.length === 0 && following.models.length === 0;

  if (nothingFollowed) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        <h1 className="font-display text-3xl text-fg sm:text-4xl">Subscriptions</h1>
        <EmptyState
          icon="💗"
          title="You are not following anyone yet"
          reason="Follow channels or models to build your feed."
          actionHref="/models"
          actionLabel="Browse models"
        />
      </div>
    );
  }

  const feed = await listFollowingFeed(user.id, following, page);
  const avatar = "h-14 w-14 rounded-full bg-surface-2 object-cover ring-2 ring-line transition group-hover:ring-brand sm:h-16 sm:w-16";

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-6 lg:px-6">
      <header>
        <h1 className="font-display text-3xl text-fg sm:text-4xl">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted">The latest from the channels and models you follow.</p>
      </header>

      <section aria-label="Following">
        <ul className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {following.channels.map((c) => (
            <li key={`c-${c.id}`} className="w-[4.5rem] shrink-0 sm:w-20">
              <Link href={`/channel/${c.slug}`} className="group flex flex-col items-center gap-1.5 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logo} alt="" width={64} height={64} loading="lazy" decoding="async" className={avatar} />
                <span className="w-full truncate text-xs font-medium text-fg">{c.name}</span>
                <span className="text-[10px] text-muted">Channel</span>
              </Link>
            </li>
          ))}
          {following.models.map((m) => (
            <li key={`m-${m.id}`} className="w-[4.5rem] shrink-0 sm:w-20">
              <Link href={`/models/${m.slug}`} className="group flex flex-col items-center gap-1.5 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.photo} alt="" width={64} height={64} loading="lazy" decoding="async" className={avatar} />
                <span className="w-full truncate text-xs font-medium text-fg">{m.name}</span>
                <span className="text-[10px] text-muted">Model</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="mb-4 text-lg font-medium text-fg sm:text-xl">
          Latest for you
        </h2>
        {feed.info.total === 0 ? (
          <EmptyState
            title="Nothing new yet"
            reason="The channels and models you follow have not published any videos yet. New uploads will appear here."
            actionHref="/browse"
            actionLabel="Browse all videos"
          />
        ) : (
          <>
            <VideoGrid videos={feed.items} />
            <Pagination page={feed.info.page} totalPages={feed.info.totalPages} basePath="/subscriptions" />
          </>
        )}
      </section>
    </div>
  );
}
