"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useSlowNetwork } from "@/components/states/OfflineBanner";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Previews autoplay unless the visitor asked for reduced motion or is on data-saver / a 2G connection. */
export function usePreviewsAllowed() {
  const slow = useSlowNetwork();
  const reduced = usePrefersReducedMotion();
  return !slow && !reduced;
}

/** True while at least `threshold` of the element is on screen (also accounts for scroll containers). */
export function useInView<T extends Element>(ref: RefObject<T | null>, threshold = 0.5) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= threshold), {
      threshold: [0, threshold, 1],
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return inView;
}

/**
 * A muted preview clip that plays while `play` is true and restarts from the beginning each time.
 *  - `loop`: repeat forever (shorts and the pricing reel).
 *  - otherwise `onEnded` runs when the clip finishes. Return `false` to play it again instead
 *    (for example while the visitor is hovering the carousel).
 *  - `onFail` runs if the browser refuses to autoplay or the file cannot load.
 */
export function PreviewVideo({
  src,
  poster,
  play,
  loop = false,
  preload = "none",
  onEnded,
  onFail,
  onPlayingChange,
  className,
}: {
  src: string;
  poster?: string;
  play: boolean;
  loop?: boolean;
  preload?: "none" | "metadata" | "auto";
  onEnded?: () => boolean | void;
  onFail?: () => void;
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const latest = useRef({ onEnded, onFail, onPlayingChange });
  useEffect(() => {
    latest.current = { onEnded, onFail, onPlayingChange };
  });

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (play) {
      video.muted = true;
      if (video.currentTime > 0) video.currentTime = 0;
      video.play().catch(() => latest.current.onFail?.());
    } else {
      video.pause();
    }
  }, [play]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop={loop}
      playsInline
      preload={preload}
      disablePictureInPicture
      tabIndex={-1}
      aria-hidden
      onPlaying={() => latest.current.onPlayingChange?.(true)}
      onPause={() => latest.current.onPlayingChange?.(false)}
      onError={() => {
        latest.current.onPlayingChange?.(false);
        latest.current.onFail?.();
      }}
      onEnded={() => {
        const again = latest.current.onEnded?.();
        const video = ref.current;
        if (again === false && video) {
          video.currentTime = 0;
          video.play().catch(() => latest.current.onFail?.());
        }
      }}
      className={className}
    />
  );
}
