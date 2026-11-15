import type { Metadata } from "next";
import { ShortsFeed } from "@/components/video/ShortsFeed";
import { watermarkFromSettings } from "@/components/video/Watermark";
import { EmptyState, PermissionDenied } from "@/components/states";
import { getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/format";
import { countShorts, listShortThumbs, listShorts } from "@/lib/queries/videos";
import { getPlan, getSettings } from "@/lib/settings";
import { loadMoreShortsAction } from "./actions";

export const metadata: Metadata = { title: "Shorts", description: "Quick vertical originals." };

export default async function ShortsPage() {
  const user = await getCurrentUser();

  if ((await countShorts()) === 0) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        <h1 className="font-display text-3xl text-fg sm:text-4xl">Shorts</h1>
        <EmptyState
          icon="📱"
          title="No shorts yet"
          reason="Shorts are added by our team. Check back soon — meanwhile there is plenty to watch."
          actionHref="/browse"
          actionLabel="Browse videos"
        />
      </div>
    );
  }

  // Non-subscribers: paywall over blurred artwork. No video ids or stream URLs are rendered.
  if (!user?.isSubscriber) {
    const [thumbs, plan] = await Promise.all([listShortThumbs(6), getPlan()]);
    const price = formatINR(plan.pricePaise);
    return (
      <div className="relative isolate flex min-h-[calc(100dvh_-_7rem)] items-center justify-center overflow-hidden md:min-h-[calc(100dvh_-_3.5rem)]">
        <h1 className="sr-only">Shorts</h1>
        <div className="absolute inset-0 -z-10 grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
          {thumbs.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              width={270}
              height={480}
              decoding="async"
              className="h-full w-full scale-110 rounded-xl object-cover opacity-50 blur-xl"
            />
          ))}
        </div>
        <div className="absolute inset-0 -z-10 bg-bg/70" aria-hidden="true" />
        <div className="mx-4 rounded-2xl border border-line bg-surface">
          {user ? (
            <PermissionDenied
              title="Subscribe to watch Shorts"
              reason="You are signed in, but Shorts need an active plan. One plan covers every video, shorts and downloads."
              actionHref="/subscribe?next=%2Fshorts"
              actionLabel={`Subscribe for ${price}`}
            />
          ) : (
            <PermissionDenied
              title="Subscribe to watch Shorts"
              reason={`Shorts are for subscribers. Create an account and subscribe for ${price} to start watching.`}
              actionHref="/register?next=%2Fshorts"
              actionLabel="Subscribe to watch"
              secondaryHref="/login?next=%2Fshorts"
              secondaryLabel="Sign in"
            />
          )}
        </div>
      </div>
    );
  }

  const [{ items, nextCursor }, settings] = await Promise.all([listShorts(null, user.id), getSettings()]);

  return (
    <>
      <h1 className="sr-only">Shorts</h1>
      <ShortsFeed
        initialItems={items}
        initialCursor={nextCursor}
        loadMore={loadMoreShortsAction}
        watermark={watermarkFromSettings(settings)}
        viewerName={user.name}
      />
    </>
  );
}
