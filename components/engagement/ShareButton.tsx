"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Copy a link to the clipboard; fall back to the native share sheet when copying is unavailable. */
async function shareLink(path: string, title: string): Promise<"copied" | "shared" | "failed"> {
  const url = new URL(path, window.location.origin).toString();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return "copied";
    }
  } catch {
    // Clipboard blocked (permissions / insecure context): try the share sheet.
  }
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title, url });
      return "shared";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "shared"; // user closed the sheet
  }
  return "failed";
}

/**
 * Share control. `children` renders the button content and receives the current
 * status so callers can style it as a rail icon or an inline pill.
 */
export function ShareButton({
  path,
  title,
  className,
  children,
}: {
  /** Same-site path to share, e.g. `/watch/my-video`. */
  path: string;
  title: string;
  className?: string;
  children: (status: "idle" | "copied" | "failed") => ReactNode;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={`Share ${title}`}
        onClick={async () => {
          const res = await shareLink(path, title);
          setStatus(res === "copied" ? "copied" : res === "failed" ? "failed" : "idle");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setStatus("idle"), 2500);
        }}
      >
        {children(status)}
      </button>
      <span role="status" className="sr-only">
        {status === "copied" ? "Link copied" : status === "failed" ? "Could not copy the link" : ""}
      </span>
    </>
  );
}
