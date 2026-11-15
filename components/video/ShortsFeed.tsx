"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Burst } from "@/components/effects";
import { CommentsSheet } from "@/components/engagement/CommentsSheet";
import { ShareButton } from "@/components/engagement/ShareButton";
import { formatCount, useLike } from "@/components/engagement/useLike";
import {
  CheckIcon,
  ChevronDown,
  ChevronUp,
  CommentIcon,
  HeartIcon,
  MutedIcon,
  PlayIcon,
  ShareIcon,
  VolumeIcon,
} from "@/components/shell/icons";
import type { Viewer } from "@/lib/engagement/types";
import { videoUrl } from "@/lib/media/urls";
import type { ShortItem, WatermarkConfig } from "@/lib/queries/types";
import { FollowButton, SUBSCRIBE_LABELS } from "./FollowButton";
import { Watermark } from "./Watermark";

export type LoadMoreShorts = (
  cursor: string,
) => Promise<{ ok: true; items: ShortItem[]; nextCursor: string | null } | { ok: false; error?: string }>;

// The page only renders the feed for subscribers; the server actions re-check anyway.
const VIEWER: Viewer = { signedIn: true, isSubscriber: true };
const DOUBLE_TAP_MS = 260;

/**
 * Vertical snap-scroll feed of shorts (subscribers only — the page never renders
 * this for anyone else). Only the short in view, and its neighbours, get a media
 * source; everything else is just a poster image.
 */
export function ShortsFeed({
  initialItems,
  initialCursor,
  loadMore,
  watermark,
  viewerName,
}: {
  initialItems: ShortItem[];
  initialCursor: string | null;
  loadMore: LoadMoreShorts;
  watermark: WatermarkConfig;
  viewerName: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true); // browsers only allow muted autoplay
  const [pausedId, setPausedId] = useState<string | null>(null); // the short the viewer paused by hand
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const slides = useRef(new Map<number, HTMLElement>());
  const loadingRef = useRef(false);

  // Which slide is in view?
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) {
              setActive(idx);
              setPausedId(null); // moving on clears a manual pause
            }
          }
        }
      },
      { root, threshold: [0.6] },
    );
    for (const el of slides.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  const fetchMore = useCallback(async () => {
    if (!cursor || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await loadMore(cursor);
      if (res.ok) {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
        });
        setCursor(res.nextCursor);
      } else {
        setLoadError(res.error ?? "We couldn't load more shorts.");
      }
    } catch {
      setLoadError("We couldn't load more shorts. Check your connection.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, loadMore]);

  // Lazy-load the next batch a few shorts before the end.
  useEffect(() => {
    if (!cursor || loadError || active < items.length - 3) return;
    const t = setTimeout(() => void fetchMore(), 0);
    return () => clearTimeout(t);
  }, [active, items.length, cursor, loadError, fetchMore]);

  const go = useCallback(
    (delta: number) => {
      const next = Math.min(Math.max(0, active + delta), items.length - 1);
      slides.current.get(next)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [active, items.length],
  );

  const commentsItem = commentsFor ? items.find((i) => i.id === commentsFor) : undefined;

  return (
    <div className="relative">
      <div
        ref={scroller}
        tabIndex={0}
        role="feed"
        aria-label="Shorts"
        aria-busy={loading}
        onKeyDown={(e) => {
          const tag = (e.target as HTMLElement).tagName;
          if (tag === "TEXTAREA" || tag === "INPUT") return;
          if (e.key === "ArrowDown" || e.key === "j") {
            e.preventDefault();
            go(1);
          } else if (e.key === "ArrowUp" || e.key === "k") {
            e.preventDefault();
            go(-1);
          } else if (e.key === "m") {
            setMuted((m) => !m);
          } else if (e.key === " " && tag !== "BUTTON" && tag !== "A") {
            e.preventDefault();
            const id = items[active]?.id;
            if (id) setPausedId((p) => (p === id ? null : id));
          }
        }}
        className="no-scrollbar h-[calc(100dvh_-_7rem_-_env(safe-area-inset-bottom))] snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none md:h-[calc(100dvh_-_3.5rem)]"
      >
        {items.map((item, i) => (
          <article
            key={item.id}
            data-index={i}
            ref={(el) => {
              if (el) slides.current.set(i, el);
              else slides.current.delete(i);
            }}
            aria-posinset={i + 1}
            aria-setsize={cursor ? -1 : items.length}
            aria-label={item.title}
            className="flex h-full snap-start snap-always items-center justify-center md:py-3"
          >
            <ShortSlide
              item={item}
              isActive={i === active}
              mounted={Math.abs(i - active) <= 1}
              muted={muted}
              userPaused={pausedId === item.id}
              onTogglePause={() => setPausedId((p) => (p === item.id ? null : item.id))}
              onToggleMute={() => setMuted((m) => !m)}
              commentCount={commentCounts[item.id] ?? item.commentCount}
              onOpenComments={() => setCommentsFor(item.id)}
              watermark={watermark}
            />
          </article>
        ))}

        {loading || loadError ? (
          <div className="flex h-24 snap-start items-center justify-center gap-3 text-sm text-muted" role="status">
            {loadError ? (
              <>
                <span>{loadError}</span>
                <button type="button" onClick={() => void fetchMore()} className="font-medium text-accent hover:underline">
                  Retry
                </button>
              </>
            ) : (
              "Loading more shorts…"
            )}
          </div>
        ) : null}
      </div>

      {/* Desktop up/down buttons */}
      <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={active === 0}
          aria-label="Previous short"
          className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-line bg-surface-2 text-fg transition hover:bg-line disabled:opacity-40"
        >
          <ChevronUp size={22} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={active >= items.length - 1}
          aria-label="Next short"
          className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-line bg-surface-2 text-fg transition hover:bg-line disabled:opacity-40"
        >
          <ChevronDown size={22} />
        </button>
      </div>

      {commentsItem ? (
        <CommentsSheet
          videoId={commentsItem.id}
          title={commentsItem.title}
          count={commentCounts[commentsItem.id] ?? commentsItem.commentCount}
          viewer={VIEWER}
          viewerName={viewerName}
          returnTo="/shorts"
          onClose={() => setCommentsFor(null)}
          onCountChange={(total) => setCommentCounts((prev) => ({ ...prev, [commentsItem.id]: total }))}
        />
      ) : null}
    </div>
  );
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type SlideProblem = null | "session" | "subscription" | "generic" | "offline";

const railBtn =
  "grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/65 active:scale-95";

function RailItem({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {children}
      {label != null ? (
        <span className="text-xs font-medium tabular-nums text-white drop-shadow" aria-hidden="true">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function ShortSlide({
  item,
  isActive,
  mounted,
  muted,
  userPaused,
  onTogglePause,
  onToggleMute,
  commentCount,
  onOpenComments,
  watermark,
}: {
  item: ShortItem;
  isActive: boolean;
  mounted: boolean;
  muted: boolean;
  userPaused: boolean;
  onTogglePause: () => void;
  onToggleMute: () => void;
  commentCount: number;
  onOpenComments: () => void;
  watermark: WatermarkConfig;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [buffering, setBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<SlideProblem>(null);
  const [attempt, setAttempt] = useState(0);
  const [burst, setBurst] = useState(0); // increments to replay the double-tap heart
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const scrubbingRef = useRef(false);
  const wasPlaying = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const src = videoUrl(item.id);
  const like = useLike({
    videoId: item.id,
    initialLiked: item.liked,
    initialCount: item.likeCount,
    viewer: VIEWER,
    returnTo: "/shorts",
  });

  // Auto-play the short in view; pause and rewind the others.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isActive && !userPaused && !problem) {
      v.play().catch(() => {});
    } else {
      v.pause();
      if (!isActive) {
        v.currentTime = 0;
      }
    }
  }, [isActive, userPaused, problem, mounted, attempt]);

  useEffect(() => () => void (tapTimer.current && clearTimeout(tapTimer.current)), []);

  // Seek slider. `pct` is 0 to 100 of the clip.
  const seekTo = (pct: number) => {
    const v = ref.current;
    if (!v || !(v.duration > 0)) return;
    const clamped = Math.min(100, Math.max(0, pct));
    v.currentTime = (clamped / 100) * v.duration;
    setProgress(clamped);
  };
  const live = useRef({ isActive, userPaused });
  useEffect(() => {
    live.current = { isActive, userPaused };
  }, [isActive, userPaused]);
  const scrubListeners = useRef<AbortController | null>(null);
  const onScrubEnd = useCallback(() => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setScrubbing(false);
    scrubListeners.current?.abort();
    const v = ref.current;
    if (v && wasPlaying.current && live.current.isActive && !live.current.userPaused) v.play().catch(() => {});
  }, []);
  const onScrubStart = () => {
    if (scrubbingRef.current) return;
    scrubbingRef.current = true;
    setScrubbing(true);
    const v = ref.current;
    wasPlaying.current = !!v && !v.paused;
    v?.pause();
    // The pointer can be released away from the slider, so listen on the window too.
    scrubListeners.current = new AbortController();
    const { signal } = scrubListeners.current;
    window.addEventListener("pointerup", onScrubEnd, { signal });
    window.addEventListener("pointercancel", onScrubEnd, { signal });
  };
  useEffect(() => () => scrubListeners.current?.abort(), []);

  // Back online → try again automatically.
  useEffect(() => {
    if (problem !== "offline") return;
    const retry = () => {
      setProblem(null);
      setAttempt((a) => a + 1);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [problem]);

  const onError = async () => {
    if (!navigator.onLine) return setProblem("offline");
    let next: SlideProblem = "generic";
    try {
      const res = await fetch(src, { headers: { Range: "bytes=0-0" }, credentials: "same-origin", cache: "no-store" });
      if (!res.ok && (res.headers.get("content-type") ?? "").includes("application/json")) {
        const body: unknown = await res.json().catch(() => null);
        const code = body && typeof body === "object" && "code" in body ? (body as { code: unknown }).code : null;
        if (code === "SESSION_EXPIRED") next = "session";
        else if (code === "SUBSCRIPTION_REQUIRED") next = "subscription";
      } else {
        res.body?.cancel().catch(() => {});
      }
    } catch {
      if (!navigator.onLine) next = "offline";
    }
    setProblem(next);
  };

  // One tap pauses/plays; a quick second tap likes instead (and never un-likes).
  const onTap = (e: MouseEvent) => {
    if (e.detail === 0) return onTogglePause(); // keyboard activation
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      like.like();
      setBurst((b) => b + 1);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      onTogglePause();
    }, DOUBLE_TAP_MS);
  };

  const wmConfig: WatermarkConfig = {
    enabled: watermark.enabled,
    // Bottom corners hold the caption and action rail on a short, so keep the mark on top.
    position: watermark.position === "top-left" || watermark.position === "bottom-left" ? "top-left" : "top-right",
  };

  return (
    <div className="relative isolate aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden bg-black md:rounded-2xl md:ring-1 md:ring-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumb}
        alt=""
        width={540}
        height={960}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {mounted && !problem ? (
        <video
          key={attempt}
          ref={ref}
          src={src}
          poster={item.thumb}
          muted={muted}
          loop
          playsInline
          preload={isActive ? "auto" : "metadata"}
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) {
              if (!scrubbingRef.current) setProgress((v.currentTime / v.duration) * 100);
              if (v.duration !== duration) setDuration(v.duration);
            }
          }}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onError={() => void onError()}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      {/* Tap to pause / play, double-tap to like */}
      <button
        type="button"
        onClick={onTap}
        aria-label={userPaused ? `Play ${item.title}` : `Pause ${item.title}`}
        className="absolute inset-0 z-10 grid cursor-pointer place-items-center"
      >
        {burst > 0 ? (
          <span key={burst} className="pointer-events-none absolute animate-ping text-accent [animation-iteration-count:1]" aria-hidden="true">
            <HeartIcon size={96} filled />
          </span>
        ) : null}
        {userPaused && !problem ? (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <PlayIcon size={28} />
          </span>
        ) : buffering && isActive && !problem ? (
          <span
            role="status"
            aria-label="Buffering"
            className="block h-10 w-10 animate-spin rounded-full border-[3px] border-white/25 border-t-brand"
          />
        ) : null}
      </button>

      <Watermark config={wmConfig} compact />

      {problem ? (
        <div role="alert" className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 text-center text-sm text-white/80">
          <div className="flex flex-col items-center gap-3">
            {problem === "offline" ? (
              <>
                <strong className="text-base text-white">You&apos;re offline</strong>
                <span>Playback will resume when you reconnect.</span>
              </>
            ) : problem === "session" ? (
              <>
                <strong className="text-base text-white">Your session expired</strong>
                <Link href="/login?next=%2Fshorts" className="btn btn-primary rounded-lg px-5 py-2 font-medium">
                  Sign in to continue
                </Link>
              </>
            ) : problem === "subscription" ? (
              <>
                <strong className="text-base text-white">Your subscription has ended</strong>
                <Link href="/subscribe?next=%2Fshorts" className="btn btn-primary rounded-lg px-5 py-2 font-medium">
                  Renew subscription
                </Link>
              </>
            ) : (
              <>
                <strong className="text-base text-white">We couldn&apos;t load this short</strong>
                <span>This is on our side, not something you did.</span>
                <button
                  type="button"
                  onClick={() => {
                    setProblem(null);
                    setAttempt((a) => a + 1);
                  }}
                  className="btn btn-primary rounded-lg px-5 py-2 font-medium"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Action rail */}
      <div className="absolute bottom-24 right-2 z-30 flex flex-col items-center gap-4 sm:right-3">
        <RailItem label={formatCount(like.count)}>
          <button
            type="button"
            onClick={like.toggle}
            aria-pressed={like.liked}
            aria-label={`${like.liked ? "Unlike" : "Like"}. ${like.count} ${like.count === 1 ? "like" : "likes"}`}
            className={`${railBtn} ${like.liked ? "!text-accent" : ""}`}
          >
            <span key={like.liked ? like.burst : 0} className={`relative grid place-items-center ${like.liked ? "fx-pop" : ""}`}>
              <HeartIcon size={26} filled={like.liked} />
              <Burst trigger={like.liked ? like.burst : 0} kind="hearts" radius={52} />
            </span>
          </button>
        </RailItem>
        <RailItem label={formatCount(commentCount)}>
          <button
            type="button"
            onClick={onOpenComments}
            aria-haspopup="dialog"
            aria-label={`Comments. ${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
            className={railBtn}
          >
            <CommentIcon size={26} />
          </button>
        </RailItem>
        <ShareButton path={`/watch/${item.slug}`} title={item.title} className="flex flex-col items-center gap-1">
          {(status) => (
            <>
              <span className={railBtn}>{status === "copied" ? <CheckIcon size={24} /> : <ShareIcon size={24} />}</span>
              <span className="text-xs font-medium text-white drop-shadow" aria-hidden="true">
                {status === "copied" ? "Copied" : status === "failed" ? "Failed" : "Share"}
              </span>
            </>
          )}
        </ShareButton>
        <RailItem>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={!muted}
            className={railBtn}
          >
            {muted ? <MutedIcon size={24} /> : <VolumeIcon size={24} />}
          </button>
        </RailItem>
      </div>

      {like.error ? (
        <p role="alert" className="absolute inset-x-4 top-14 z-30 rounded-xl bg-black/75 px-3 py-2 text-center text-xs text-white">
          {like.error}
        </p>
      ) : null}

      {/* Caption */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent pb-9 pl-4 pr-20 pt-16">
        {item.owner ? (
          <div className="pointer-events-auto mb-2 flex flex-wrap items-center gap-2.5">
            <Link href={item.owner.href} className="flex min-w-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.owner.avatar}
                alt=""
                width={36}
                height={36}
                loading="lazy"
                decoding="async"
                className="h-9 w-9 shrink-0 rounded-full bg-surface-2 object-cover ring-1 ring-white/30"
              />
              <span className="truncate text-sm font-medium text-white">{item.owner.name}</span>
            </Link>
            <FollowButton
              kind={item.owner.kind}
              targetId={item.owner.id}
              name={item.owner.name}
              initialFollowing={item.owner.following}
              signedIn
              loginNext="/shorts"
              size="sm"
              labels={SUBSCRIBE_LABELS}
            />
          </div>
        ) : null}
        <p className="line-clamp-2 text-sm font-medium text-white">{item.title}</p>
      </div>

      {/* Seek slider: drag to scrub. Playback pauses while dragging and resumes on release. */}
      <div className="absolute inset-x-0 bottom-0 z-40 px-3 pb-1">
        {scrubbing && duration > 0 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-9 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 font-mono text-xs tabular-nums text-white"
          >
            {formatTime((progress / 100) * duration)} / {formatTime(duration)}
          </span>
        ) : null}
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(progress * 10)}
          disabled={!mounted || !!problem || duration <= 0}
          aria-label="Seek"
          aria-valuetext={`${formatTime((progress / 100) * duration)} of ${formatTime(duration)}`}
          className="scrubber"
          style={{ "--p": `${progress}%` } as CSSProperties}
          onPointerDown={onScrubStart}
          onPointerUp={onScrubEnd}
          onPointerCancel={onScrubEnd}
          onBlur={onScrubEnd}
          onChange={(e) => seekTo(Number(e.currentTarget.value) / 10)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const v = ref.current;
              if (v && duration > 0) seekTo(((v.currentTime + (e.key === "ArrowRight" ? 5 : -5)) / duration) * 100);
            }
          }}
        />
      </div>
    </div>
  );
}
