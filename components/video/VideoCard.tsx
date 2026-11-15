"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatDuration } from "@/lib/format";
import type { VideoCardData } from "@/lib/queries/types";
import { usePreviewsAllowed } from "./preview";

function subscribeHover(cb: () => void) {
  const mq = window.matchMedia("(hover: hover)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** True on devices with a real pointer that can hover (laptops, desktops). False on phones and tablets. */
function useCanHover() {
  return useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia("(hover: hover)").matches,
    () => true,
  );
}

/** The muted preview clip. It is mounted only while it should play, so a grid never downloads clips up front. */
function CardPreview({ src }: { src: string }) {
  const [ready, setReady] = useState(false);
  return (
    <video
      src={src}
      muted
      loop
      autoPlay
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setReady(true)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
    />
  );
}

/**
 * Catalogue card with a preview for every video that has one (short or long).
 *  - Laptops and desktops: hover or focus the card and the thumbnail turns into the muted preview.
 *  - Phones and tablets (no hover): the card that sits in the middle of the screen plays its preview,
 *    and it stops again as you scroll on. Data saver and reduced motion switch the touch previews off.
 */
export function VideoCard({
  video,
  showChannel = true,
  eager = false,
}: {
  video: VideoCardData;
  showChannel?: boolean;
  eager?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [inMiddle, setInMiddle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const canHover = useCanHover();
  const allowed = usePreviewsAllowed();
  const href = `/watch/${video.slug}`;

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Touch devices: watch for the card crossing the middle band of the screen.
  const watchMiddle = !canHover && allowed && !!video.preview;
  useEffect(() => {
    const el = linkRef.current;
    if (!watchMiddle || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInMiddle(entry.isIntersecting && entry.intersectionRatio >= 0.3), {
      rootMargin: "-35% 0px -35% 0px",
      threshold: [0, 0.3, 1],
    });
    io.observe(el);
    return () => io.disconnect();
  }, [watchMiddle]);

  const start = () => {
    if (!video.preview || !canHover) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(true), 250); // ignore a pointer just passing over
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    setHovered(false);
  };

  const playing = !!video.preview && (hovered || (watchMiddle && inMiddle));

  return (
    <article className="group min-w-0">
      <Link
        ref={linkRef}
        href={href}
        className="relative block aspect-video overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line/60 transition group-hover:ring-brand/60"
        onMouseEnter={start}
        onMouseLeave={stop}
        onFocus={start}
        onBlur={stop}
        aria-label={video.title}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={video.thumb}
          alt=""
          width={640}
          height={360}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="h-full w-full object-cover transition duration-300"
        />
        {playing && video.preview ? <CardPreview src={video.preview} /> : null}
        {video.durationSec > 0 ? (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
            {formatDuration(video.durationSec)}
          </span>
        ) : null}
        {video.episodeNo != null ? (
          <span className="absolute left-2 top-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
            Ep {video.episodeNo}
          </span>
        ) : null}
        {video.progressPct != null ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25" aria-hidden="true">
            <span className="block h-full bg-brand" style={{ width: `${video.progressPct}%` }} />
          </span>
        ) : null}
      </Link>

      <div className="mt-3 flex gap-3">
        {showChannel && video.channel ? (
          <Link href={`/channel/${video.channel.slug}`} className="shrink-0" aria-label={`${video.channel.name} channel`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={video.channel.logo}
              alt=""
              width={36}
              height={36}
              loading="lazy"
              decoding="async"
              className="h-9 w-9 rounded-full bg-surface-2 object-cover"
            />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-fg">
            <Link href={href} className="hover:text-accent" tabIndex={-1}>
              {video.title}
            </Link>
          </h3>
          <p className="mt-1 truncate text-xs text-muted">
            {showChannel && video.channel ? (
              <>
                <Link href={`/channel/${video.channel.slug}`} className="hover:text-fg">
                  {video.channel.name}
                </Link>
                {video.ago ? <span aria-hidden="true"> · </span> : null}
              </>
            ) : null}
            {video.progressPct != null ? `${video.progressPct}% watched` : video.ago}
          </p>
        </div>
      </div>
    </article>
  );
}
