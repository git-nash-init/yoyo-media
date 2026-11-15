"use client";

import { renderIcon } from "@/components/ui/line-icon";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ExitFullscreenIcon,
  FullscreenIcon,
  PauseIcon,
  PlayIcon,
  RotateIcon,
  WifiOffIcon,
} from "@/components/shell/icons";
import { buttonClass } from "@/components/ui";
import { formatDuration } from "@/lib/format";
import type { WatermarkConfig } from "@/lib/queries/types";
import { VolumeControl, usePortraitViewport } from "./VolumeControl";
import { Watermark } from "./Watermark";

type Problem = null | "session" | "subscription" | "generic";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SAVE_EVERY_MS = 10_000;
const SLOW_AFTER_MS = 4_000;
const HIDE_CONTROLS_MS = 3_000;

type Props = {
  videoId: string;
  slug: string;
  title: string;
  /** Subscriber-only stream URL. Only ever passed for subscribers. */
  src: string;
  poster: string;
  /** Short, light preview clip offered on slow connections. */
  previewSrc: string | null;
  durationSec: number;
  /** Seconds to resume from (`?t=` or saved progress). */
  initialPosition: number;
  watermark: WatermarkConfig;
  subscribeHref: string;
};

/**
 * Custom-controlled HTML5 player. The WRAPPER div goes fullscreen (not the
 * <video>), so the watermark and every state overlay stay visible in fullscreen.
 */
export function Player({
  videoId,
  slug,
  title,
  src,
  poster,
  previewSrc,
  durationSec,
  initialPosition,
  watermark,
  subscribeHref,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [usingPreview, setUsingPreview] = useState(false);
  const [current, setCurrent] = useState(initialPosition);
  const [duration, setDuration] = useState(durationSec);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [nativeFull, setNativeFull] = useState(false); // browser full screen
  const [fakeFull, setFakeFull] = useState(false); // cover-the-page full screen for browsers without the Fullscreen API
  const fullscreen = nativeFull || fakeFull;
  // Long-format videos open full screen in landscape. The viewer can switch to portrait and back.
  const [orient, setOrient] = useState<"landscape" | "portrait">("landscape");
  const [orientLocked, setOrientLocked] = useState(false); // true when the device itself turned to match
  const portraitViewport = usePortraitViewport();
  const [controlsVisible, setControlsVisible] = useState(true);

  // Mutable bookkeeping that must not trigger renders.
  const position = useRef(initialPosition); // last known position in the FULL video
  const pendingSeek = useRef<number | null>(initialPosition > 0 ? initialPosition : null);
  const wantPlay = useRef(false);
  const lastSaved = useRef(-1);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef(false);
  const checkingError = useRef(false);

  // ---------- progress saving ----------
  const saveProgress = useCallback(
    (force = false) => {
      if (previewRef.current) return;
      const pos = Math.floor(position.current);
      if (!force && Math.abs(pos - lastSaved.current) < 2) return;
      if (pos === lastSaved.current) return;
      lastSaved.current = pos;
      // keepalive lets the request finish while the page is being closed.
      fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, positionSec: pos }),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {
        lastSaved.current = -1; // try again on the next tick
      });
    },
    [videoId],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused && !v.ended) saveProgress();
    }, SAVE_EVERY_MS);
    const onHide = () => saveProgress(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", onHide);
      saveProgress(true);
    };
  }, [saveProgress]);

  // ---------- slow-connection hint ----------
  const clearSlowTimer = useCallback(() => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = null;
  }, []);
  const armSlowTimer = useCallback(() => {
    if (slowTimer.current) return;
    slowTimer.current = setTimeout(() => {
      slowTimer.current = null;
      if (navigator.onLine) setSlow(true);
    }, SLOW_AFTER_MS);
  }, []);
  useEffect(() => clearSlowTimer, [clearSlowTimer]);

  // ---------- (re)loading the media element ----------
  const reload = useCallback(
    (opts: { preview?: boolean; play?: boolean } = {}) => {
      const v = videoRef.current;
      if (!v) return;
      const toPreview = opts.preview ?? previewRef.current;
      previewRef.current = toPreview;
      setUsingPreview(toPreview);
      setProblem(null);
      setSlow(false);
      setReady(false);
      setWaiting(false);
      clearSlowTimer();
      pendingSeek.current = toPreview ? null : position.current > 0 ? position.current : null;
      wantPlay.current = opts.play ?? true;
      v.loop = toPreview;
      v.src = toPreview && previewSrc ? previewSrc : src;
      v.load();
      armSlowTimer();
    },
    [src, previewSrc, clearSlowTimer, armSlowTimer],
  );

  // ---------- offline / online ----------
  useEffect(() => {
    const goOffline = () => {
      const v = videoRef.current;
      wantPlay.current = wantPlay.current || (!!v && !v.paused);
      setOffline(true);
      setSlow(false);
      clearSlowTimer();
    };
    const goOnline = () => {
      setOffline(false);
      const v = videoRef.current;
      if (!v) return;
      // Reconnected: reload from where we were if the element gave up, otherwise just carry on.
      if (v.error || v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) reload({ play: true });
      else if (wantPlay.current) v.play().catch(() => {});
    };
    if (!navigator.onLine) goOffline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [reload, clearSlowTimer]);

  // ---------- media error: ask the server why ----------
  const diagnose = useCallback(async () => {
    if (checkingError.current) return;
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }
    checkingError.current = true;
    let next: Problem = "generic";
    try {
      const res = await fetch(src, {
        headers: { Range: "bytes=0-0" },
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok && (res.headers.get("content-type") ?? "").includes("application/json")) {
        const body: unknown = await res.json().catch(() => null);
        const code = body && typeof body === "object" && "code" in body ? (body as { code: unknown }).code : null;
        if (code === "SESSION_EXPIRED") next = "session";
        else if (code === "SUBSCRIPTION_REQUIRED") next = "subscription";
      } else {
        res.body?.cancel().catch(() => {});
      }
    } catch {
      if (!navigator.onLine) {
        checkingError.current = false;
        setOffline(true);
        return;
      }
    }
    checkingError.current = false;
    setWaiting(false);
    setSlow(false);
    clearSlowTimer();
    setProblem(next);
  }, [src, clearSlowTimer]);

  // ---------- metadata ----------
  const speedRef = useRef(1);
  const handleMetadata = useCallback(
    (v: HTMLVideoElement) => {
      setReady(true);
      clearSlowTimer();
      if (!previewRef.current && Number.isFinite(v.duration)) setDuration(v.duration);
      const seek = pendingSeek.current;
      pendingSeek.current = null;
      // Resume, unless the saved position is basically the end.
      if (seek != null && Number.isFinite(v.duration) && seek < v.duration - 3) v.currentTime = seek;
      v.playbackRate = speedRef.current;
      if (wantPlay.current) v.play().catch(() => {});
    },
    [clearSlowTimer],
  );

  // The element is server-rendered, so its first events can fire before React
  // attaches handlers. Catch up once on mount.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.error) void diagnose();
    else if (v.readyState >= HTMLMediaElement.HAVE_METADATA) handleMetadata(v);
    else armSlowTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- controls auto-hide ----------
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setControlsVisible(false);
    }, HIDE_CONTROLS_MS);
  }, []);
  useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), []);

  // ---------- fullscreen (of the wrapper) ----------
  // Phones that allow it are turned to the chosen orientation. Where the browser cannot turn the
  // screen (desktops, iPhones), the picture itself is rotated (landscape on a portrait screen) or
  // framed as a tall column (portrait on a wide screen), so both choices work on every device.
  const lockOrientation = useCallback(async (o: "landscape" | "portrait") => {
    const so = typeof screen !== "undefined" ? (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }) : null;
    try {
      if (!so?.lock) throw new Error("unsupported");
      await so.lock(o);
      setOrientLocked(true);
    } catch {
      setOrientLocked(false);
    }
  }, []);

  const releaseOrientation = useCallback(() => {
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* not supported */
    }
    setOrientLocked(false);
  }, []);

  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === wrapRef.current;
      setNativeFull(on);
      if (!on) releaseOrientation();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [releaseOrientation]);

  const exitFullscreen = useCallback(() => {
    setFakeFull(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    releaseOrientation();
  }, [releaseOrientation]);

  const enterFullscreen = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setOrient("landscape"); // the default view for long videos
    if (wrap.requestFullscreen) {
      wrap
        .requestFullscreen()
        .then(() => lockOrientation("landscape"))
        .catch(() => setFakeFull(true));
    } else {
      setFakeFull(true);
    }
  }, [lockOrientation]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement || fakeFull) exitFullscreen();
    else enterFullscreen();
  }, [fakeFull, exitFullscreen, enterFullscreen]);

  const toggleOrientation = useCallback(() => {
    const next = orient === "landscape" ? "portrait" : "landscape";
    setOrient(next);
    if (document.fullscreenElement) void lockOrientation(next);
  }, [orient, lockOrientation]);

  // Leaving the page must not leave the screen locked or the browser stuck in full screen.
  useEffect(
    () => () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* not supported */
      }
    },
    [],
  );

  // ---------- transport ----------
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || problem) return;
    if (v.paused || v.ended) {
      wantPlay.current = true;
      v.play().catch(() => {});
    } else {
      wantPlay.current = false;
      v.pause();
    }
  }, [problem]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || previewRef.current) return;
    const max = Number.isFinite(v.duration) ? v.duration : t;
    const clamped = Math.min(Math.max(0, t), max);
    v.currentTime = clamped;
    position.current = clamped;
    setCurrent(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.5;
  }, []);

  const setVolumeLevel = useCallback((value: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = value;
    v.muted = value === 0;
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    const onButton = tag === "BUTTON" || tag === "A";
    if (tag === "SELECT" || (tag === "INPUT" && target.dataset.role === "volume")) return;
    switch (e.key) {
      case " ":
      case "k":
        if (e.key === " " && onButton) return; // let the focused button act
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        seekTo(position.current - 5);
        break;
      case "ArrowRight":
        e.preventDefault();
        seekTo(position.current + 5);
        break;
      case "f":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "Escape":
        if (!fakeFull) return;
        e.preventDefault();
        exitFullscreen();
        break;
      case "m":
        e.preventDefault();
        toggleMute();
        break;
      default:
        return;
    }
    showControls();
  };

  // ---------- derived ----------
  const total = duration > 0 ? duration : durationSec;
  const playedPct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const bufferedPct = total > 0 ? Math.min(100, (bufferedEnd / total) * 100) : 0;
  const aheadSec = Math.max(0, bufferedEnd - current);
  const blocked = problem !== null || offline;
  const showSpinner = !blocked && ready && waiting;
  const resumeAt = Math.floor(current);
  const loginHref = `/login?next=${encodeURIComponent(`/watch/${slug}${resumeAt > 0 ? `?t=${resumeAt}` : ""}`)}`;
  // Orientation fallbacks for devices that cannot turn the screen themselves.
  const rotateStage = fullscreen && orient === "landscape" && portraitViewport && !orientLocked;
  const portraitFrame = fullscreen && orient === "portrait" && !portraitViewport && !orientLocked;
  const stageClass = rotateStage
    ? "absolute left-full top-0 origin-top-left rotate-90"
    : portraitFrame
      ? "absolute inset-y-0 left-1/2 -translate-x-1/2 border-x border-white/10"
      : "absolute inset-0";
  const stageStyle: React.CSSProperties | undefined = rotateStage
    ? { width: "100dvh", height: "100dvw" }
    : portraitFrame
      ? { aspectRatio: "9 / 16", minWidth: "min(100%, 22rem)" }
      : undefined;
  // Keep hints clear of the watermark corner.
  const hintPos =
    watermark.enabled && watermark.position === "top-left"
      ? "right-3 top-3 sm:right-4 sm:top-4"
      : "left-3 top-3 sm:left-4 sm:top-4";
  const iconBtn =
    "grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15 focus-visible:bg-white/15";

  return (
    <div
      ref={wrapRef}
      role="region"
      aria-label={`Video player: ${title}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={showControls}
      onPointerDown={showControls}
      onFocus={showControls}
      className={`group/player isolate w-full overflow-hidden bg-black outline-none ${
        fakeFull ? "fixed inset-0 z-[90] h-full" : fullscreen ? "relative h-full" : "relative aspect-video rounded-xl ring-1 ring-line"
      } ${controlsVisible || !playing ? "" : "cursor-none"}`}
    >
      {/* Stage: everything the viewer sees. It is turned a quarter turn when landscape is chosen on a portrait screen. */}
      <div className={stageClass} style={stageStyle}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        className="h-full w-full bg-black object-contain"
        onLoadStart={armSlowTimer}
        onLoadedMetadata={(e) => handleMetadata(e.currentTarget)}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (!previewRef.current && Number.isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          if (previewRef.current) return;
          position.current = e.currentTarget.currentTime;
          setCurrent(e.currentTarget.currentTime);
        }}
        onProgress={(e) => {
          if (previewRef.current) return;
          const v = e.currentTarget;
          let end = 0;
          for (let i = 0; i < v.buffered.length; i++) {
            if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) > end) end = v.buffered.end(i);
          }
          setBufferedEnd(end);
        }}
        onPlay={() => {
          setPlaying(true);
          wantPlay.current = true;
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
          saveProgress(true);
        }}
        onEnded={() => {
          wantPlay.current = false;
          setPlaying(false);
          setControlsVisible(true);
          saveProgress(true);
        }}
        onWaiting={() => {
          setWaiting(true);
          armSlowTimer();
        }}
        onStalled={armSlowTimer}
        onPlaying={() => {
          setWaiting(false);
          setSlow(false);
          clearSlowTimer();
        }}
        onCanPlay={() => {
          setWaiting(false);
          clearSlowTimer();
        }}
        onSeeking={() => setWaiting(true)}
        onSeeked={() => setWaiting(false)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onRateChange={(e) => {
          speedRef.current = e.currentTarget.playbackRate;
          setSpeed(e.currentTarget.playbackRate);
        }}
        onError={() => void diagnose()}
      />

      <Watermark config={watermark} />

      {/* Loading skeleton until metadata arrives */}
      {!ready && !blocked ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" role="status">
          <div className="skeleton absolute inset-0 !rounded-none opacity-40" aria-hidden="true" />
          <div className="relative flex flex-col items-center gap-3">
            <Spinner />
            <span className="text-sm font-medium text-white/90">Loading video…</span>
          </div>
        </div>
      ) : null}

      {/* Buffering indicator with real buffered progress */}
      {showSpinner ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/55 px-5 py-4 backdrop-blur-sm">
            <Spinner />
            <span className="text-xs font-medium tabular-nums text-white/90">
              Buffering… {Math.round(bufferedPct)}% loaded
              {aheadSec >= 1 ? ` · ${Math.floor(aheadSec)}s ahead` : ""}
            </span>
          </div>
        </div>
      ) : null}

      {/* Big play button when paused */}
      {ready && !playing && !waiting && !blocked ? (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute left-1/2 top-1/2 z-10 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand-600"
        >
          <PlayIcon size={28} />
        </button>
      ) : null}

      {/* Slow connection hint: unobtrusive, keeps trying in the background */}
      {slow && !blocked && !usingPreview ? (
        <div
          role="status"
          className={`absolute z-30 flex max-w-[80%] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-black/75 px-3 py-2 text-xs text-white backdrop-blur-sm sm:text-sm ${hintPos}`}
        >
          <span>
            <strong className="font-medium">Slow connection.</strong> Still trying…
          </span>
          {previewSrc ? (
            <button
              type="button"
              onClick={() => reload({ preview: true, play: true })}
              className="rounded-lg bg-white/15 px-3 py-1 font-medium hover:bg-white/25"
            >
              Play a short clip
            </button>
          ) : null}
          <button type="button" onClick={() => setSlow(false)} className="font-medium text-white/70 hover:text-white">
            Dismiss
          </button>
        </div>
      ) : null}

      {usingPreview && !blocked ? (
        <div
          role="status"
          className={`absolute z-30 flex max-w-[80%] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-black/75 px-3 py-2 text-xs text-white backdrop-blur-sm sm:text-sm ${hintPos}`}
        >
          <span>Playing a short clip to save data.</span>
          <button
            type="button"
            onClick={() => reload({ preview: false, play: true })}
            className="btn btn-primary rounded-lg px-3 py-1 font-medium"
          >
            Back to the full video
          </button>
        </div>
      ) : null}

      {/* Blocking states */}
      {offline ? (
        <Overlay icon={<WifiOffIcon size={26} />} title="You're offline" live="polite">
          <p>Playback will resume when you reconnect. Your place is saved.</p>
        </Overlay>
      ) : problem === "session" ? (
        <Overlay icon="🔒" title="Your session expired">
          <p>You were signed out for your security. Sign in again and we will pick up right where you stopped.</p>
          <Link href={loginHref} className={buttonClass("primary", "md", "mt-4")}>
            Sign in to continue
          </Link>
        </Overlay>
      ) : problem === "subscription" ? (
        <Overlay icon="🔒" title="Your subscription has ended">
          <p>Watching is for subscribers. Renew your plan to keep watching from where you stopped.</p>
          <Link href={subscribeHref} className={buttonClass("primary", "md", "mt-4")}>
            Renew subscription
          </Link>
        </Overlay>
      ) : problem === "generic" ? (
        <Overlay icon="⚠️" title="We couldn't load this video">
          <p>This is on our side, not something you did. Try again — your place is saved.</p>
          <button type="button" onClick={() => reload({ play: true })} className={buttonClass("primary", "md", "mt-4")}>
            Retry
          </button>
        </Overlay>
      ) : null}

      {/* Controls */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 pb-1.5 pt-10 transition-opacity duration-200 sm:px-3 ${
          blocked ? "pointer-events-none opacity-0" : controlsVisible || !playing ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Seek bar: visual track + an invisible native range on top for mouse, touch and keyboard */}
        <div className="group/seek relative mx-1.5 flex h-5 items-center">
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/seek:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-white/45" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${playedPct}%` }} />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-0 shadow transition-opacity group-focus-within/seek:opacity-100 group-hover/seek:opacity-100"
            style={{ left: `${playedPct}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(total))}
            step={1}
            value={Math.min(Math.floor(current), Math.max(1, Math.floor(total)))}
            disabled={!ready || usingPreview}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Seek"
            aria-valuetext={`${formatDuration(current)} of ${formatDuration(total)}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className={iconBtn}>
            {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>

          <VolumeControl
            variant="bar"
            volume={volume}
            muted={muted}
            onVolume={setVolumeLevel}
            onToggleMute={toggleMute}
            alwaysOpen={fullscreen}
            buttonClass={iconBtn}
          />

          <span className="ml-2 select-none whitespace-nowrap text-xs font-medium tabular-nums text-white sm:text-sm">
            {formatDuration(current)} <span className="text-white/60">/ {formatDuration(total)}</span>
          </span>

          <span className="flex-1" />

          <label className="flex items-center">
            <span className="sr-only">Playback speed</span>
            <select
              value={speed}
              onChange={(e) => {
                const v = videoRef.current;
                if (v) v.playbackRate = Number(e.target.value);
              }}
              className="h-9 cursor-pointer rounded-lg bg-transparent px-2 text-xs font-medium text-white outline-none hover:bg-white/15 focus-visible:bg-white/15 sm:text-sm"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s} className="bg-surface text-fg">
                  {s === 1 ? "1× Normal" : `${s}×`}
                </option>
              ))}
            </select>
          </label>

          {fullscreen ? (
            <button
              type="button"
              onClick={toggleOrientation}
              aria-label={orient === "landscape" ? "Switch to portrait view" : "Switch to landscape view"}
              title={orient === "landscape" ? "Switch to portrait view" : "Switch to landscape view"}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-white transition hover:bg-white/15 focus-visible:bg-white/15"
            >
              <RotateIcon size={20} />
              <span className="hidden text-xs font-medium sm:inline">{orient === "landscape" ? "Landscape" : "Portrait"}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
            className={iconBtn}
          >
            {fullscreen ? <ExitFullscreenIcon size={20} /> : <FullscreenIcon size={20} />}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="block h-10 w-10 animate-spin rounded-full border-[3px] border-white/25 border-t-brand"
    />
  );
}

function Overlay({
  icon,
  title,
  children,
  live = "assertive",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  live?: "polite" | "assertive";
}) {
  return (
    <div
      role={live === "assertive" ? "alert" : "status"}
      aria-live={live}
      className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-black/80 p-4 text-center backdrop-blur-sm"
    >
      <div className="flex max-w-sm flex-col items-center text-sm text-white/80">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-lg bg-white/10 text-white" aria-hidden="true">
          {renderIcon(icon)}
        </div>
        <h2 className="mb-1.5 text-base font-medium text-white sm:text-lg">{title}</h2>
        {children}
      </div>
    </div>
  );
}
