"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { SearchIcon } from "./icons";

type Suggestion = { label: string; href: string; kind: string };

/**
 * Header search. A plain GET form to /search (works without JavaScript), with
 * optional typeahead suggestions from /api/search layered on top.
 */
export function SearchBox() {
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = pathname === "/search" ? (params.get("q") ?? "") : "";
  // Re-mount on navigation so the box always reflects the current search (and closes).
  return <SearchBoxInner key={`${pathname}?${initial}`} initial={initial} />;
}

function SearchBoxInner({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLFormElement>(null);
  const listId = useId();

  // Debounced typeahead; stale responses are aborted.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || q === initial) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
          credentials: "same-origin",
        });
        if (!res.ok) return setSuggestions([]);
        const data: unknown = await res.json();
        const list =
          data && typeof data === "object" && Array.isArray((data as { suggestions?: unknown }).suggestions)
            ? ((data as { suggestions: Suggestion[] }).suggestions ?? [])
            : [];
        setSuggestions(list.filter((s) => typeof s?.href === "string" && s.href.startsWith("/")).slice(0, 8));
        setOpen(true);
      } catch {
        // Aborted or offline: suggestions are a nicety, the form still works.
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, initial]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const showList = open && value.trim().length >= 2 && suggestions.length > 0;

  return (
    <form
      ref={boxRef}
      action="/search"
      method="get"
      role="search"
      className="relative min-w-0 flex-1 md:max-w-md"
      onSubmit={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <label className="sr-only" htmlFor={`${listId}-q`}>
        Search videos, series, models and channels
      </label>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
        <SearchIcon size={18} />
      </span>
      <input
        id={`${listId}-q`}
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setOpen(true)}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Search"
        aria-controls={showList ? listId : undefined}
        className="h-10 w-full rounded-lg border border-line bg-surface pl-10 pr-4 text-sm text-fg outline-none placeholder:text-muted/70 focus:border-accent"
      />
      {showList ? (
        <ul
          id={listId}
          aria-label="Suggestions"
          className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-2xl"
        >
          {suggestions.map((s) => (
            <li key={`${s.kind}:${s.href}`}>
              <Link
                href={s.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2"
              >
                <span className="truncate">{s.label}</span>
                <span className="shrink-0 text-xs text-muted">{s.kind}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
