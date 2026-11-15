"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * UI states "No Internet" and "Slow network".
 *  - <OfflineBanner />  slim fixed banner while offline, brief "Back online" confirmation,
 *                       and a dismissible hint when the connection is slow / data-saver is on.
 *  - useSlowNetwork()   true when previews should not autoplay (show thumbnails instead).
 *  - useOnline()        false while the browser reports no connection.
 */

type NetInfo = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: "change", cb: () => void) => void;
  removeEventListener?: (type: "change", cb: () => void) => void;
};

function getConnection(): NetInfo | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { connection?: NetInfo; mozConnection?: NetInfo; webkitConnection?: NetInfo };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

function subscribeSlow(cb: () => void) {
  const conn = getConnection();
  conn?.addEventListener?.("change", cb);
  return () => conn?.removeEventListener?.("change", cb);
}
function slowSnapshot() {
  const conn = getConnection();
  if (!conn) return false;
  return conn.saveData === true || conn.effectiveType === "2g" || conn.effectiveType === "slow-2g";
}

/** True when the browser reports data-saver or a 2G-class connection. Always false on the server. */
export function useSlowNetwork(): boolean {
  return useSyncExternalStore(subscribeSlow, slowSnapshot, () => false);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** False while the browser is offline. Always true on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

// Remembered for the lifetime of the tab so the hint does not come back on every navigation.
let slowHintDismissed = false;

export function OfflineBanner() {
  const online = useOnline();
  const slow = useSlowNetwork();
  const [justReconnected, setJustReconnected] = useState(false);
  const [dismissed, setDismissed] = useState(() => slowHintDismissed);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onOnline = () => {
      setJustReconnected(true);
      clearTimeout(timer);
      timer = setTimeout(() => setJustReconnected(false), 3500);
    };
    const onOffline = () => {
      clearTimeout(timer);
      setJustReconnected(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const showSlow = online && slow && !dismissed && !justReconnected;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-3 pb-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {/* Live region stays mounted so screen readers announce changes. */}
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-2">
        {!online ? (
          <div className="pointer-events-auto flex max-w-xl items-start gap-2.5 rounded-2xl border border-warning/40 bg-surface/95 px-4 py-2.5 text-sm text-fg shadow-lg shadow-black/40 backdrop-blur light:shadow-black/10 animate-fade-in">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-warning" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8a15 15 0 0 0-8.3-3.7M5 12.9a10 10 0 0 1 3.3-2.1M19 12.9a10 10 0 0 0-3.6-2.2M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />
            </svg>
            <span>
              <strong className="font-medium">You&apos;re offline.</strong> Pages you&apos;ve already opened still work; playback and
              sign-in need a connection.
            </span>
          </div>
        ) : justReconnected ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-success/40 bg-surface/95 px-4 py-2 text-sm text-fg shadow-lg shadow-black/40 backdrop-blur light:shadow-black/10 animate-fade-in">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
            Back online
          </div>
        ) : null}
      </div>

      {showSlow ? (
        <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border border-line bg-surface/95 py-2 pl-4 pr-2 text-sm text-fg shadow-lg shadow-black/40 backdrop-blur light:shadow-black/10 animate-fade-in">
          <span role="status">Slow connection detected — autoplay is paused to save data.</span>
          <button
            type="button"
            onClick={() => {
              slowHintDismissed = true;
              setDismissed(true);
            }}
            aria-label="Dismiss slow connection notice"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default OfflineBanner;
