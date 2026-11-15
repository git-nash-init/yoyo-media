"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { BellIcon, CheckIcon, CloseIcon } from "@/components/shell/icons";

/**
 * Small, dependency-free celebration effects (CSS + inline SVG only, so there is no animation
 * file to download, which matters on a slow connection). Both respect prefers-reduced-motion.
 */

const HEART = "M12 20.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.9c0 5.6-7.5 10-7.5 10z";
const CONFETTI_COLORS = ["var(--color-brand)", "var(--color-accent)", "#f2b84b", "#ffffff", "var(--color-success)"];

type Kind = "hearts" | "confetti";

/**
 * A one-shot burst of particles centred on its parent (the parent needs `position: relative`).
 * Change `trigger` to a new number to play it again; 0 renders nothing.
 */
export function Burst({ trigger, kind, radius = 44 }: { trigger: number; kind: Kind; radius?: number }) {
  if (!trigger) return null;
  const n = kind === "hearts" ? 9 : 16;
  return (
    <span key={trigger} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-0 w-0">
      {Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2 + (i % 2 ? 0.25 : -0.15);
        const dist = radius * (0.6 + ((i * 37) % 10) / 20);
        // Hearts drift upward; confetti flies out in a ring.
        const dx = Math.cos(angle) * dist * (kind === "hearts" ? 0.8 : 1);
        const dy = kind === "hearts" ? -Math.abs(Math.sin(angle)) * dist - radius * 0.35 : Math.sin(angle) * dist;
        const style = {
          "--dx": `${dx.toFixed(1)}px`,
          "--dy": `${dy.toFixed(1)}px`,
          "--rot": `${((i * 53) % 120) - 60}deg`,
          animationDelay: `${(i % 4) * 22}ms`,
        } as CSSProperties;
        if (kind === "hearts") {
          const size = 12 + (i % 3) * 4;
          return (
            <svg key={i} viewBox="0 0 24 24" width={size} height={size} className="fx-particle text-accent" style={style}>
              <path d={HEART} fill="currentColor" />
            </svg>
          );
        }
        return (
          <span
            key={i}
            className="fx-particle"
            style={{
              ...style,
              width: i % 3 === 0 ? 5 : 7,
              height: i % 3 === 0 ? 5 : 3,
              borderRadius: i % 3 === 0 ? 9999 : 1,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            }}
          />
        );
      })}
    </span>
  );
}

/**
 * Pop-up shown when someone subscribes to a channel or follows a model. It floats above the
 * page (portal to <body>, so a clipped player cannot hide it), goes away by itself, and can be
 * dismissed. Pass `show` as a counter: each new value shows it again, 0 hides it.
 */
export function FollowToast({
  show,
  name,
  subscribe,
  onClose,
}: {
  show: number;
  name: string;
  subscribe: boolean;
  onClose: () => void;
}) {
  // false while rendering on the server and during hydration, true afterwards (the portal needs <body>).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onClose, 4200);
    return () => clearTimeout(t);
  }, [show, onClose]);

  if (!show || !mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-[70] flex justify-center px-3">
      <div
        key={show}
        role="status"
        aria-live="polite"
        className="fx-toast glass-panel pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl p-3 pr-2"
      >
        <span className="relative grid h-11 w-11 shrink-0 place-items-center">
          <span className="fx-ring absolute inset-0 rounded-full border-2 border-brand" aria-hidden="true" />
          <span className="fx-ring absolute inset-0 rounded-full border-2 border-brand [animation-delay:180ms]" aria-hidden="true" />
          <span className="fx-pop relative grid h-11 w-11 place-items-center rounded-full bg-brand text-white shadow-md">
            <BellIcon size={20} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-success text-white ring-2 ring-[color:var(--color-surface)]">
              <CheckIcon size={11} strokeWidth={3} />
            </span>
          </span>
          <Burst trigger={show} kind="confetti" radius={52} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {subscribe ? "Subscribed to " : "Following "}
            {name}
          </p>
          <p className="text-xs text-muted">
            Their new videos will appear in{" "}
            <Link href="/subscriptions" className="font-medium text-accent hover:underline">
              Subscriptions
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-fg"
        >
          <CloseIcon size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
