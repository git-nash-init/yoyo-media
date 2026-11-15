"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { VideoCardData } from "@/lib/queries/types";

/**
 * Catalogue card. On hover/focus (pointer devices only) the thumbnail is swapped
 * for the short muted preview clip when one exists. The preview element is only
 * mounted while active, so a grid of cards never downloads clips up front.
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
  const [active, setActive] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const href = `/watch/${video.slug}`;

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const start = () => {
    if (!video.preview) return;
    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(true), 250); // ignore a pointer just passing over
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    setActive(false);
    setPreviewReady(false);
  };

  return (
    <article className="group min-w-0">
      <Link
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
        {active && video.preview ? (
          <video
            src={video.preview}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            disablePictureInPicture
            aria-hidden="true"
            tabIndex={-1}
            onPlaying={() => setPreviewReady(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${previewReady ? "opacity-100" : "opacity-0"}`}
          />
        ) : null}
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
