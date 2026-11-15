"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ChevronDown } from "./icons";

/**
 * Signed-in account menu. `signOut` is the logout Server Action, passed down from
 * the layout so the sign-out button is a real <form> post.
 */
export function AccountMenu({
  name,
  email,
  isAdmin,
  isSubscriber,
  signOut,
}: {
  name: string;
  email: string;
  isAdmin: boolean;
  isSubscriber: boolean;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block w-full px-4 py-2.5 text-left text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account menu for ${name}`}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface-2 pl-1 pr-2 text-sm font-medium text-fg hover:bg-line"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-medium text-white" aria-hidden="true">
          {initial}
        </span>
        <span className="hidden max-w-28 truncate lg:inline">{name}</span>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl animate-fade-in">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-fg">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
            <p className={`mt-1.5 text-xs font-medium ${isSubscriber ? "text-success" : "text-accent"}`}>
              {isSubscriber ? "Subscription active" : "No active subscription"}
            </p>
          </div>
          <div className="border-b border-line px-4 py-3">
            <p className="mb-2 text-xs font-medium text-muted">Theme</p>
            <ThemeToggle variant="segmented" fullWidth />
          </div>
          <nav aria-label="Account" className="py-1.5" onClick={() => setOpen(false)}>
            <Link href="/account" className={item}>
              Account
            </Link>
            {!isSubscriber ? (
              <Link href="/subscribe" className={`${item} font-medium text-accent`}>
                Subscribe
              </Link>
            ) : null}
            {isAdmin ? (
              <Link href="/admin" className={item}>
                Admin
              </Link>
            ) : null}
            <form action={signOut}>
              <button type="submit" className={item}>
                Sign out
              </button>
            </form>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
