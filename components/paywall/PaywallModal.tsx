"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { buttonClass } from "@/components/ui";

export type PaywallModalProps = {
  open: boolean;
  onClose: () => void;
  /** Formatted plan price, e.g. "₹999". */
  priceLabel: string;
  /** Plan length text, e.g. "30 days". */
  planLabel: string;
  /** Title of the video the visitor tried to play (optional). */
  videoTitle?: string | null;
  /** Primary button target, e.g. /register?next=/watch/<slug>. */
  primaryHref: string;
  primaryLabel: string;
  /** "Already a member? Sign in" target; omit/null when the visitor is signed in. */
  signInHref?: string | null;
};

const BENEFITS = [
  "Every series, short and exclusive drop — in full",
  "Download episodes and watch them offline",
  "New originals added every week, on any device",
];

/**
 * "Subscribe to watch" dialog. Built on the native <dialog> element opened with
 * showModal(): the browser traps focus inside it, makes the page behind inert,
 * closes it on Escape and returns focus to the element that opened it.
 *
 * This is a UX prompt only. Access to videos is enforced on the server.
 */
export function PaywallModal({
  open,
  onClose,
  priceLabel,
  planLabel,
  videoTitle,
  primaryHref,
  primaryLabel,
  signInHref,
}: PaywallModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prevOverflow;
      };
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={onClose}
      onCancel={(e) => {
        // Escape: close through React state so `open` stays in sync.
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md overflow-visible rounded-xl border border-line bg-transparent p-0 text-fg backdrop:bg-black/70 open:animate-fade-in"
    >
      <div className="relative overflow-hidden rounded-xl bg-surface">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="relative px-6 pb-6 pt-8 sm:px-8 sm:pb-8">
          <div aria-hidden className="mb-5 grid h-12 w-12 place-items-center rounded-lg border border-line bg-surface-2 text-fg">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>

          <h2 id={titleId} className="font-display text-3xl">
            Subscribe to watch the full video
          </h2>
          <p id={descId} className="mt-2 text-sm leading-relaxed text-muted">
            {videoTitle ? (
              <>
                You&apos;ve been watching a short preview of <span className="font-medium text-fg">{videoTitle}</span>. Members get
                the whole thing.
              </>
            ) : (
              <>You&apos;ve been watching a short preview. Members get the whole thing.</>
            )}
          </p>

          <p className="mt-5 flex items-baseline gap-2">
            <span className="font-display text-5xl">{priceLabel}</span>
            <span className="text-sm text-muted">for {planLabel} of full access</span>
          </p>

          <ul className="mt-5 space-y-2.5 text-sm">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col gap-3">
            <Link href={primaryHref} className={buttonClass("primary", "lg", "w-full")}>
              {primaryLabel}
            </Link>
            {signInHref ? (
              <Link href={signInHref} className={buttonClass("ghost", "md", "w-full text-muted")}>
                Already a member? Sign in
              </Link>
            ) : (
              <button type="button" onClick={onClose} className={buttonClass("ghost", "md", "w-full text-muted")}>
                Not now
              </button>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-muted">Cancel anytime. Test-mode payments during launch.</p>
        </div>
      </div>
    </dialog>
  );
}

export default PaywallModal;
