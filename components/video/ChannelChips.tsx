import Link from "next/link";
import type { ChannelRef } from "@/lib/queries/types";

const chip =
  "btn inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-medium";
const idle = "btn-secondary";
const on = "btn-primary";

/** Horizontally scrollable row of channel chips. `activeSlug` highlights the current channel; null highlights "All". */
export function ChannelChips({
  channels,
  activeSlug = null,
  allHref = "/browse",
}: {
  channels: ChannelRef[];
  activeSlug?: string | null;
  allHref?: string;
}) {
  if (!channels.length) return null;
  return (
    <nav aria-label="Channels" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <Link href={allHref} aria-current={activeSlug === null ? "page" : undefined} className={`${chip} ${activeSlug === null ? on : idle}`}>
        All
      </Link>
      {channels.map((c) => {
        const active = c.slug === activeSlug;
        return (
          <Link
            key={c.id}
            href={`/channel/${c.slug}`}
            aria-current={active ? "page" : undefined}
            className={`${chip} pl-1.5 ${active ? on : idle}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.logo}
              alt=""
              width={28}
              height={28}
              loading="lazy"
              decoding="async"
              className="h-7 w-7 rounded-full bg-surface object-cover"
            />
            <span className="whitespace-nowrap">{c.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
