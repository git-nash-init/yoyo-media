"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { RANGE_LABELS, type DateRangeState, type RangeKey, validateCustom } from "@/lib/admin/dateRange";
import { buttonClass, cn, inputClass } from "@/components/ui";

const PRESETS: RangeKey[] = ["all", "today", "yesterday", "week", "month", "year"];
// Removed on every range change: the date params themselves, the page number, and one-shot flash params.
const DATE_KEYS = ["range", "from", "to", "page", "created", "deleted"];

/** Optional "filter by" switch, e.g. Added (createdAt) vs Published (publishedAt) on the video lists. */
export type FieldToggle = { param: string; value: string; options: { value: string; label: string }[] };

/**
 * Date range filter: preset pills plus a Custom pill with two date inputs.
 * Writes ?range=…&from=…&to=… to the URL, keeps every other query param and resets ?page.
 * The server parses and validates the URL again (lib/admin/dateRange.ts); this component only builds it.
 */
export function DateRangeFilter({ range, caption, field }: { range: DateRangeState; caption?: string; field?: FieldToggle }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const id = useId();

  // A server-side custom error means the user asked for Custom: keep the inputs open with their values.
  const requestedCustom = range.key === "custom" || Boolean(range.error);
  const [customOpen, setCustomOpen] = useState(requestedCustom);
  const [from, setFrom] = useState(range.from && requestedCustom ? range.from : "");
  const [to, setTo] = useState(range.to && requestedCustom ? range.to : "");
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const error = localError ?? (customOpen ? range.error : undefined);

  const hrefWith = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const k of DATE_KEYS) sp.delete(k);
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const go = (next: Record<string, string | undefined>) => {
    setLocalError(undefined);
    startTransition(() => router.push(hrefWith(next), { scroll: false }));
  };

  const choosePreset = (key: RangeKey) => {
    setCustomOpen(false);
    go(key === "all" ? {} : { range: key });
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateCustom(from, to, range.min, range.max);
    if (err) {
      setLocalError(err);
      return;
    }
    go({ range: "custom", from, to });
  };

  const activeKey: RangeKey = customOpen ? "custom" : range.error ? "all" : range.key;
  const pill = (active: boolean) =>
    cn(
      "btn inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-medium",
      active ? "btn-primary" : "btn-secondary text-muted hover:text-fg",
    );

  const fieldHref = (value: string) => {
    if (!field) return pathname;
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("page");
    if (value === field.options[0]?.value) sp.delete(field.param);
    else sp.set(field.param, value);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <section aria-label="Date range" className="mb-4 rounded-xl border border-line bg-surface p-3" aria-busy={pending || undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Date range presets" className="no-scrollbar -mx-1 flex min-w-0 max-w-full gap-1.5 overflow-x-auto px-1 py-0.5">
          {PRESETS.map((key) => (
            <button key={key} type="button" aria-pressed={activeKey === key} onClick={() => choosePreset(key)} className={pill(activeKey === key)}>
              {RANGE_LABELS[key]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={activeKey === "custom"}
            aria-expanded={customOpen}
            aria-controls={`${id}-custom`}
            onClick={() => {
              setLocalError(undefined);
              setCustomOpen((o) => !o);
            }}
            className={pill(activeKey === "custom")}
          >
            Custom…
          </button>
        </div>
        <p className="min-w-0 text-xs text-muted" aria-live="polite">
          <span className="font-medium text-fg">{range.error ? RANGE_LABELS.all : range.label}</span>
          {caption ? <span> · {caption}</span> : null}
          {pending ? <span> · Updating…</span> : null}
        </p>
        {field ? (
          <div role="group" aria-label="Filter by date" className="ml-auto inline-flex rounded-full border border-line bg-surface-2 p-0.5">
            {field.options.map((o) => (
              <Link
                key={o.value}
                href={fieldHref(o.value)}
                scroll={false}
                aria-current={field.value === o.value ? "true" : undefined}
                className={cn(
                  "inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium",
                  field.value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {o.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {customOpen ? (
        <form id={`${id}-custom`} onSubmit={applyCustom} noValidate className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">From</span>
            <input
              type="date"
              value={from}
              min={range.min}
              max={range.max}
              onChange={(e) => {
                setFrom(e.target.value);
                setLocalError(undefined);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-err` : undefined}
              className={cn(inputClass, "h-10 w-auto min-w-[10rem]")}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">To (inclusive)</span>
            <input
              type="date"
              value={to}
              min={range.min}
              max={range.max}
              onChange={(e) => {
                setTo(e.target.value);
                setLocalError(undefined);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-err` : undefined}
              className={cn(inputClass, "h-10 w-auto min-w-[10rem]")}
              required
            />
          </label>
          <button type="submit" className={buttonClass("primary", "md")} disabled={pending}>
            Apply
          </button>
          {error ? (
            <p id={`${id}-err`} role="alert" className="basis-full text-sm text-danger">
              {error} The date filter was not applied.
            </p>
          ) : (
            <p className="basis-full text-xs text-muted">Dates are in India time (IST). Both days are included.</p>
          )}
        </form>
      ) : null}
    </section>
  );
}
