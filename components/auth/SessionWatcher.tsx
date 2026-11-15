"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { buttonClass } from "@/components/ui";

const CHECK_EVERY_MS = 3 * 60_000;
const DRAFT_PREFIX = "yoyo:draft:";

type DraftField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Form fields that opted in with `data-draft`. Password and file fields are never included. */
function draftFields(): DraftField[] {
  return Array.from(document.querySelectorAll<DraftField>("[data-draft][name]")).filter(
    (el) =>
      (el instanceof HTMLInputElement && !["password", "file", "hidden"].includes(el.type)) ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement,
  );
}

const draftKey = (pathname: string, name: string) => `${DRAFT_PREFIX}${pathname}:${name}`;

function saveDrafts(pathname: string) {
  try {
    for (const el of draftFields()) {
      const isToggle = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
      if (isToggle) continue;
      sessionStorage.setItem(draftKey(pathname, el.name), el.value);
    }
  } catch {
    // Storage can be unavailable (private mode); losing a draft is acceptable.
  }
}

/** Set a value so React-controlled inputs notice the change too. */
function setFieldValue(el: DraftField, value: string) {
  const proto =
    el instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function restoreDrafts(pathname: string) {
  try {
    for (const el of draftFields()) {
      const key = draftKey(pathname, el.name);
      const saved = sessionStorage.getItem(key);
      if (saved === null) continue;
      sessionStorage.removeItem(key);
      if (saved !== el.value) setFieldValue(el, saved);
    }
  } catch {
    // Ignore: nothing to restore.
  }
}

/**
 * Mounted by the app shell for signed-in users. Detects an expired session on
 * window focus and on a timer, saves in-progress form drafts, and asks the user
 * to sign in again without losing their place.
 */
export function SessionWatcher() {
  const pathname = usePathname();
  const [expired, setExpired] = useState(false);
  const [loginHref, setLoginHref] = useState("/login");
  const linkRef = useRef<HTMLAnchorElement>(null);
  const checking = useRef(false);

  // Bring back anything saved before the last sign-in prompt.
  useEffect(() => {
    const t = window.setTimeout(() => restoreDrafts(pathname), 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const check = useCallback(async () => {
    if (checking.current || document.visibilityState === "hidden") return;
    checking.current = true;
    try {
      const res = await fetch("/api/session", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!res.ok) return; // server trouble is not the same as being signed out
      const data: unknown = await res.json();
      const authenticated =
        typeof data === "object" && data !== null && (data as { authenticated?: unknown }).authenticated === true;
      if (!authenticated) {
        const here = window.location.pathname + window.location.search;
        saveDrafts(window.location.pathname);
        setLoginHref(`/login?next=${encodeURIComponent(here)}`);
        setExpired(true);
      }
    } catch {
      // Offline: try again on the next focus or tick.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    if (expired) return;
    const onFocus = () => void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onFocus, CHECK_EVERY_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [check, expired]);

  // While the dialog is open: move focus into it and stop the page behind from scrolling.
  useEffect(() => {
    if (!expired) return;
    linkRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expired]);

  if (!expired) return null;

  // The link is the only focusable element, so Tab stays on it.
  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      linkRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-desc"
        onKeyDown={trapFocus}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 text-center shadow-2xl"
      >
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-accent" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h2 id="session-expired-title" className="text-lg font-medium text-fg">
          Your session expired
        </h2>
        <p id="session-expired-desc" className="mt-2 text-sm text-muted">
          Your session expired for security. Sign in again to continue — your place is saved.
        </p>
        <a ref={linkRef} href={loginHref} className={buttonClass("primary", "lg", "mt-6 w-full")}>
          Sign in again
        </a>
      </div>
    </div>
  );
}
