"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { MutedIcon, VolumeIcon } from "@/components/shell/icons";

function subscribeNothing() {
  return () => {};
}
/** iPhones and iPads ignore `video.volume` (the hardware buttons control it), so a slider would do nothing there. */
export function useVolumeSupported() {
  return useSyncExternalStore(
    subscribeNothing,
    () => {
      const probe = document.createElement("video");
      probe.volume = 0.5;
      return probe.volume === 0.5;
    },
    () => true,
  );
}

function subscribePortrait(cb: () => void) {
  const mq = window.matchMedia("(orientation: portrait)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** True while the browser window is taller than it is wide. */
export function usePortraitViewport() {
  return useSyncExternalStore(
    subscribePortrait,
    () => window.matchMedia("(orientation: portrait)").matches,
    () => false,
  );
}

/**
 * Speaker button plus a volume slider, used by the player and by Shorts.
 *  - `bar`: sits inline in the player's control row. The slider is always there on wide screens; on
 *    narrow screens it opens when the speaker is tapped, unless `alwaysOpen` (full screen) is set.
 *  - `rail`: a single round button for Shorts. Tapping it mutes or unmutes and slides a small pill
 *    open beside it for a few seconds, so it costs no space until it is needed.
 * Dragging the slider to zero mutes; raising it again unmutes.
 */
export function VolumeControl({
  volume,
  muted,
  onVolume,
  onToggleMute,
  variant,
  alwaysOpen = false,
  buttonClass,
  iconSize = 20,
}: {
  volume: number;
  muted: boolean;
  /** 0 to 1. */
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  variant: "bar" | "rail";
  alwaysOpen?: boolean;
  buttonClass: string;
  iconSize?: number;
}) {
  const supported = useVolumeSupported();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const level = muted ? 0 : volume;

  const wake = useCallback(() => {
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 3000);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const button = (
    <button
      type="button"
      onClick={() => {
        onToggleMute();
        if (supported) wake();
      }}
      aria-label={level === 0 ? "Unmute" : "Mute"}
      aria-pressed={level === 0}
      className={buttonClass}
    >
      {level === 0 ? <MutedIcon size={iconSize} /> : <VolumeIcon size={iconSize} />}
    </button>
  );

  const slider = supported ? (
    <input
      type="range"
      data-role="volume"
      min={0}
      max={1}
      step={0.05}
      value={level}
      aria-label="Volume"
      aria-valuetext={`${Math.round(level * 100)} percent`}
      className="scrubber"
      style={{ "--p": `${level * 100}%` } as CSSProperties}
      onChange={(e) => {
        onVolume(Number(e.currentTarget.value));
        wake();
      }}
      onPointerDown={wake}
    />
  ) : null;

  if (variant === "bar") {
    return (
      <>
        {button}
        {slider ? <div className={alwaysOpen || open ? "w-24 shrink-0" : "hidden w-24 shrink-0 sm:block"}>{slider}</div> : null}
      </>
    );
  }

  return (
    <div className="relative" onPointerEnter={(e) => e.pointerType === "mouse" && supported && wake()} onFocusCapture={() => supported && wake()}>
      {button}
      {slider && open ? (
        <div className="absolute right-full top-1/2 mr-2 w-36 -translate-y-1/2 rounded-full bg-black/60 px-3 backdrop-blur-sm">{slider}</div>
      ) : null}
    </div>
  );
}
