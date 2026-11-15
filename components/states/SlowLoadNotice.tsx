"use client";

import { useEffect, useState } from "react";

/**
 * Slow-network state. A page that is still showing its loading skeleton after a few seconds
 * is almost always waiting on a weak or lossy connection, not on the server. Instead of
 * leaving a silent skeleton on screen, say what is happening and offer a reload.
 * Works for every route because every loading screen is built from `.skeleton` blocks.
 */
const SLOW_AFTER_MS = 8000;

export function SlowLoadNotice() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let since: number | null = null;
    const id = setInterval(() => {
      if (!document.querySelector(".skeleton")) {
        since = null;
        setSlow(false);
        return;
      }
      since ??= Date.now();
      if (Date.now() - since >= SLOW_AFTER_MS) setSlow(true);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!slow) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[65] flex justify-center px-3 md:bottom-6">
      <div
        role="status"
        aria-live="polite"
        className="glass-panel pointer-events-auto flex max-w-md items-center gap-4 rounded-xl px-4 py-3 text-sm animate-fade-in"
      >
        <p className="text-fg">This is taking longer than usual. Your connection may be slow or unstable.</p>
        <button type="button" onClick={() => window.location.reload()} className="btn btn-secondary h-8 shrink-0 rounded-lg px-3 text-sm font-medium">
          Reload
        </button>
      </div>
    </div>
  );
}
