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
function useCanHover() {
  return useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia("(hover: hover)").matches,
    () => true,
  );
}

function RowPreview({ src }: { src: string }) {
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
 * Compact horizontal card for the sidebar (More like this, episodes).
 * Same short clip as the catalogue cards: hover or focus it on a laptop or desktop; on a phone the row
 * that sits in the middle of the screen plays it.
 */
export function VideoRow({ video, current = false }: { video: VideoCardData; current?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [inMiddle, setInMiddle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const canHover = useCanHover();
  const allowed = usePreviewsAllowed();

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const watchMiddle = !canHover && allowed && !!video.preview && !current;
  useEffect(() => {
    const el = thumbRef.current;
    if (!watchMiddle || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInMiddle(entry.isIntersecting && entry.intersectionRatio >= 0.3), {
      rootMargin: "-35% 0px -35% 0px",
      threshold: [0, 0.3, 1],
    });
    io.observe(el);
    return () => io.disconnect();
  }, [watchMiddle]);

  const start = () => {
    if (!video.preview || !canHover || current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(true), 250);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    setHovered(false);
  };

  const playing = !!video.preview && !current && (hovered || (watchMiddle && inMiddle));

  return (
    <Link
      href={`/watch/${video.slug}`}
      aria-current={current ? "true" : undefined}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      className={`group flex gap-3 rounded-xl p-2 transition hover:bg-surface-2 ${current ? "bg-surface-2 ring-1 ring-brand/50" : ""}`}
    >
      <span ref={thumbRef} className="relative block aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={video.thumb}
          alt=""
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        {playing && video.preview ? <RowPreview src={video.preview} /> : null}
        {video.durationSec > 0 ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {formatDuration(video.durationSec)}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        {video.episodeNo != null ? (
          <span className="block text-xs font-medium text-accent">
            Episode {video.episodeNo}
            {current ? " · Now playing" : ""}
          </span>
        ) : current ? (
          <span className="block text-xs font-medium text-accent">Now playing</span>
        ) : null}
        <span className="line-clamp-2 text-sm font-medium leading-snug text-fg group-hover:text-accent">{video.title}</span>
        <span className="mt-1 block truncate text-xs text-muted">
          {[video.channel?.name, video.ago].filter(Boolean).join(" · ")}
        </span>
      </span>
    </Link>
  );
}
