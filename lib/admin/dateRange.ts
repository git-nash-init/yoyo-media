// Admin date-range filter: parsing, IST day boundaries, Prisma filters and chart buckets.
// Pure (no server-only / prisma imports) so it is unit tested and usable from client components.
//
// Semantics
// - Every day boundary is midnight in the site timezone, Asia/Kolkata (IST, UTC+05:30, no DST),
//   whatever timezone the server process runs in. All maths is done on UTC epoch milliseconds.
// - Ranges are half-open: [start, end). Presets always cover the WHOLE calendar period:
//   Today = [today 00:00, tomorrow 00:00), This week = [Monday 00:00, next Monday 00:00),
//   This month = [1st 00:00, 1st of next month 00:00), This year = [1 Jan, next 1 Jan).
//   No row can be in the future, so this is equivalent to "period to date" for counts.
// - Custom: `from` and `to` are inclusive calendar days for the user (YYYY-MM-DD, IST);
//   internally end = midnight after `to`.
// - "All time" has no start/end (no filter at all).
import { z } from "zod";

export const SITE_TZ = "Asia/Kolkata";
/** IST is a fixed UTC+05:30 offset (India has no daylight saving). */
export const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const RANGE_KEYS = ["all", "today", "yesterday", "week", "month", "year", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export type PresetKey = Exclude<RangeKey, "all" | "custom">;

export const RANGE_LABELS: Record<RangeKey, string> = {
  all: "All time",
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  year: "This year",
  custom: "Custom",
};

/** Lower bound for custom dates. The upper bound is today + 1 year (IST). */
export const MIN_DATE = "2000-01-01";

export type DateRange = {
  key: RangeKey;
  /** Inclusive start (IST midnight). Undefined = no lower bound (All time). */
  start?: Date;
  /** Exclusive end (IST midnight after the last day). Undefined = no upper bound. */
  end?: Date;
  /** Human label, e.g. "This week · 9–15 Nov 2026". */
  label: string;
  /** Inclusive first/last calendar day (YYYY-MM-DD, IST) of an applied range. On a custom-range error, the raw input. */
  from?: string;
  to?: string;
  /** Set when a custom range was requested but could not be applied (the range then falls back to All time). */
  error?: string;
  /** Allowed bounds for the custom date inputs. */
  min: string;
  max: string;
};

// ---------- IST conversion ----------

export type YMD = { y: number; m: number; d: number }; // m is 1-12

/** Calendar date + weekday of an instant in IST. weekday: 0 = Sunday … 6 = Saturday. */
export function istParts(date: Date): YMD & { hour: number; weekday: number } {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant of 00:00 IST on the given calendar day. Month/day overflow rolls over (e.g. m = 13). */
export function istMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** Start (00:00 IST) of the calendar day that contains `date`. */
export function istStartOfDay(date: Date): Date {
  const p = istParts(date);
  return istMidnight(p.y, p.m, p.d);
}

/** YYYY-MM-DD of an instant in IST. */
export function istDateKey(date: Date): string {
  const p = istParts(date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Strict YYYY-MM-DD parser: rejects impossible dates such as 2026-02-30. */
export function parseYMD(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** today + 1 year (IST), the latest date a custom range may use. */
export function maxCustomDate(now: Date): string {
  const p = istParts(now);
  // Day overflow handles 29 Feb → 1 Mar of the next (non-leap) year.
  return istDateKey(istMidnight(p.y + 1, p.m, p.d));
}

// ---------- Presets ----------

/** [start, end) of a preset, computed from `now` in IST. */
export function presetRange(key: PresetKey, now: Date): { start: Date; end: Date } {
  const p = istParts(now);
  switch (key) {
    case "today":
      return { start: istMidnight(p.y, p.m, p.d), end: istMidnight(p.y, p.m, p.d + 1) };
    case "yesterday":
      return { start: istMidnight(p.y, p.m, p.d - 1), end: istMidnight(p.y, p.m, p.d) };
    case "week": {
      // Monday-based week: Sunday (0) belongs to the week that started six days earlier.
      const sinceMonday = (p.weekday + 6) % 7;
      return { start: istMidnight(p.y, p.m, p.d - sinceMonday), end: istMidnight(p.y, p.m, p.d - sinceMonday + 7) };
    }
    case "month":
      return { start: istMidnight(p.y, p.m, 1), end: istMidnight(p.y, p.m + 1, 1) };
    case "year":
      return { start: istMidnight(p.y, 1, 1), end: istMidnight(p.y + 1, 1, 1) };
  }
}

// ---------- Labels ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9–15 Nov 2026", "28 Oct – 3 Nov 2026", "30 Dec 2025 – 5 Jan 2026", "13 Nov 2026". Both days inclusive. */
export function formatDaySpan(first: YMD, last: YMD): string {
  const one = (x: YMD, withYear: boolean, withMonth = true) =>
    `${x.d}${withMonth ? ` ${MONTHS[x.m - 1]}` : ""}${withYear ? ` ${x.y}` : ""}`;
  if (first.y === last.y && first.m === last.m && first.d === last.d) return one(first, true);
  if (first.y === last.y && first.m === last.m) return `${first.d}–${one(last, true)}`;
  if (first.y === last.y) return `${one(first, false)} – ${one(last, true)}`;
  return `${one(first, true)} – ${one(last, true)}`;
}

function spanOf(start: Date, end: Date): { first: YMD; last: YMD } {
  const first = istParts(start);
  const last = istParts(new Date(end.getTime() - 1));
  return { first, last };
}

function labelFor(key: RangeKey, start?: Date, end?: Date): string {
  if (key === "all" || !start || !end) return RANGE_LABELS.all;
  const { first, last } = spanOf(start, end);
  if (key === "month") return `${RANGE_LABELS.month} · ${MONTHS[first.m - 1]} ${first.y}`;
  if (key === "year") return `${RANGE_LABELS.year} · ${first.y}`;
  return `${RANGE_LABELS[key]} · ${formatDaySpan(first, last)}`;
}

/** Lower-case phrase for empty states: "today", "this week", "between 1 and 5 Nov 2026". */
export function rangePhrase(range: DateRange): string {
  switch (range.key) {
    case "all":
      return "";
    case "today":
    case "yesterday":
      return range.key;
    case "week":
    case "month":
    case "year":
      return `this ${range.key}`;
    case "custom": {
      if (!range.start || !range.end) return "";
      const { first, last } = spanOf(range.start, range.end);
      const span = formatDaySpan(first, last);
      return span.includes("–") ? `between ${span.replace(/\s?–\s?/, " and ")}` : `on ${span}`;
    }
  }
}

// ---------- Parsing ----------

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function rawParam(sp: RawParams, key: string): string | undefined {
  const v = sp instanceof URLSearchParams ? (sp.get(key) ?? undefined) : sp[key];
  return Array.isArray(v) ? v[0] : v;
}

const rangeKeySchema = z.enum(RANGE_KEYS);
const dateParamSchema = z.string().trim().max(10).regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Read `?range=…&from=…&to=…` into a validated range. Anything unknown or missing → All time.
 * A custom range that is incomplete, malformed, reversed or out of bounds is NOT applied: the result is
 * All time with `error` set and the raw `from`/`to` echoed back so the inputs can show them.
 */
export function parseDateRange(sp: RawParams, now: Date = new Date()): DateRange {
  const min = MIN_DATE;
  const max = maxCustomDate(now);
  const keyParsed = rangeKeySchema.safeParse(rawParam(sp, "range"));
  const key: RangeKey = keyParsed.success ? keyParsed.data : "all";
  const all: DateRange = { key: "all", label: RANGE_LABELS.all, min, max };

  if (key === "all") return all;
  if (key !== "custom") {
    const { start, end } = presetRange(key, now);
    const { first, last } = spanOf(start, end);
    return { key, start, end, label: labelFor(key, start, end), from: ymdKey(first), to: ymdKey(last), min, max };
  }

  const fromRaw = (rawParam(sp, "from") ?? "").trim().slice(0, 10);
  const toRaw = (rawParam(sp, "to") ?? "").trim().slice(0, 10);
  const fail = (error: string): DateRange => ({ ...all, error, from: fromRaw || undefined, to: toRaw || undefined });

  const error = validateCustom(fromRaw, toRaw, min, max);
  if (error) return fail(error);
  const f = parseYMD(fromRaw)!;
  const t = parseYMD(toRaw)!;
  const start = istMidnight(f.y, f.m, f.d);
  const end = istMidnight(t.y, t.m, t.d + 1);
  return { key: "custom", start, end, label: `${RANGE_LABELS.custom} · ${formatDaySpan(f, t)}`, from: fromRaw, to: toRaw, min, max };
}

/** Shared by the server parser and the client form, so both show the same message. */
export function validateCustom(from: string, to: string, min: string, max: string): string | undefined {
  if (!from || !to) return "Pick both a start and an end date.";
  if (!dateParamSchema.safeParse(from).success || !parseYMD(from)) return "The start date is not a valid date.";
  if (!dateParamSchema.safeParse(to).success || !parseYMD(to)) return "The end date is not a valid date.";
  if (from < min || to < min || from > max || to > max) return `Pick dates between ${displayDate(min)} and ${displayDate(max)}.`;
  // YYYY-MM-DD strings compare in calendar order.
  if (from > to) return "The start date is after the end date.";
  return undefined;
}

function ymdKey(x: YMD): string {
  return `${x.y}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
}

function displayDate(s: string): string {
  const p = parseYMD(s);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : s;
}

// ---------- Query helpers ----------

/** `{ gte, lt }` for a Prisma DateTime filter, or undefined for All time. */
export function toPrismaDateFilter(range: Pick<DateRange, "start" | "end">): { gte: Date; lt: Date } | undefined {
  return range.start && range.end ? { gte: range.start, lt: range.end } : undefined;
}

/** Spread into a Prisma `where`: `{ ...dateWhere("createdAt", range) }`. Empty object for All time. */
export function dateWhere<K extends string>(field: K, range: Pick<DateRange, "start" | "end">): { [P in K]?: { gte: Date; lt: Date } } {
  const f = toPrismaDateFilter(range);
  return (f ? { [field]: f } : {}) as { [P in K]?: { gte: Date; lt: Date } };
}

/** URL params that reproduce an applied range (empty for All time or a range with an error). */
export function rangeParams(range: DateRange): { range?: string; from?: string; to?: string } {
  if (range.key === "all") return {};
  if (range.key === "custom") return { range: "custom", from: range.from, to: range.to };
  return { range: range.key };
}

/** True when the date filter is narrowing results. */
export function isRangeActive(range: DateRange): boolean {
  return range.key !== "all" && Boolean(range.start);
}

/**
 * The previous period of equal length, for "vs previous period" comparisons.
 * The current period is clipped to `now` first, so mid-month "This month" (1–13 Nov) compares with the
 * 13 days before it, not a whole month. Returns undefined for All time.
 */
export function previousPeriod(range: Pick<DateRange, "start" | "end">, now: Date): { current: { gte: Date; lt: Date }; previous: { gte: Date; lt: Date } } | undefined {
  if (!range.start || !range.end) return undefined;
  const curEnd = new Date(Math.min(range.end.getTime(), Math.max(now.getTime(), range.start.getTime() + 1)));
  const len = curEnd.getTime() - range.start.getTime();
  return { current: { gte: range.start, lt: curEnd }, previous: { gte: new Date(range.start.getTime() - len), lt: range.start } };
}

/** "+12% vs previous period", "−5% vs previous period", "New: none in previous period", "Same as previous period". */
export function compareText(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "None in previous period either" : "Up from 0 in previous period";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "Same as previous period";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% vs previous period`;
}

// ---------- Chart buckets ----------

export type BucketUnit = "hour" | "day" | "month" | "year";
export type Bucket = { key: string; label: string; start: Date; end: Date };
export type Buckets = { unit: BucketUnit; start: Date; end: Date; buckets: Bucket[]; note?: string };

export const ALL_TIME_CHART_DAYS = 30;
const MAX_DAILY_BUCKETS = 62;
const MAX_MONTHLY_BUCKETS = 60;

/**
 * Chart buckets for a range: hourly for a single day (Today, Yesterday, a one-day custom range),
 * daily up to 62 days, monthly beyond (This year), yearly past 60 months.
 * All time has no bounds, so charts show the last 30 days (today included) and say so in `note`.
 */
export function bucketsFor(range: Pick<DateRange, "start" | "end">, now: Date = new Date()): Buckets {
  let start = range.start;
  let end = range.end;
  let note: string | undefined;
  if (!start || !end) {
    end = istMidnight(istParts(now).y, istParts(now).m, istParts(now).d + 1);
    start = new Date(end.getTime() - ALL_TIME_CHART_DAYS * DAY_MS);
    note = `Charts show the last ${ALL_TIME_CHART_DAYS} days for All time.`;
  }
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const buckets: Bucket[] = [];

  if (days <= 1) {
    for (let t = start.getTime(); t < end.getTime(); t += HOUR_MS) {
      const h = istParts(new Date(t)).hour;
      buckets.push({ key: `${istDateKey(new Date(t))}T${String(h).padStart(2, "0")}`, label: `${String(h).padStart(2, "0")}:00`, start: new Date(t), end: new Date(t + HOUR_MS) });
    }
    return { unit: "hour", start, end, buckets, note };
  }

  if (days <= MAX_DAILY_BUCKETS) {
    const s = istParts(start);
    for (let i = 0; i < days; i++) {
      const b = istMidnight(s.y, s.m, s.d + i);
      const p = istParts(b);
      buckets.push({ key: istDateKey(b), label: `${p.d} ${MONTHS[p.m - 1]}`, start: b, end: istMidnight(s.y, s.m, s.d + i + 1) });
    }
    return { unit: "day", start, end, buckets, note };
  }

  const s = istParts(start);
  const e = istParts(new Date(end.getTime() - 1));
  const months = (e.y - s.y) * 12 + (e.m - s.m) + 1;
  if (months <= MAX_MONTHLY_BUCKETS) {
    for (let i = 0; i < months; i++) {
      const monthStart = istMidnight(s.y, s.m + i, 1);
      const p = istParts(monthStart);
      buckets.push({
        key: `${p.y}-${String(p.m).padStart(2, "0")}`,
        label: `${MONTHS[p.m - 1]} ${String(p.y).slice(2)}`,
        // The first and last bucket are clipped to the range.
        start: new Date(Math.max(monthStart.getTime(), start.getTime())),
        end: new Date(Math.min(istMidnight(s.y, s.m + i + 1, 1).getTime(), end.getTime())),
      });
    }
    return { unit: "month", start, end, buckets, note };
  }

  for (let y = s.y; y <= e.y; y++) {
    buckets.push({
      key: String(y),
      label: String(y),
      start: new Date(Math.max(istMidnight(y, 1, 1).getTime(), start.getTime())),
      end: new Date(Math.min(istMidnight(y + 1, 1, 1).getTime(), end.getTime())),
    });
  }
  return { unit: "year", start, end, buckets, note };
}

/** Sum `valueOf` per bucket (count by default). Items outside every bucket are ignored. */
export function fillBuckets<T>(
  buckets: Bucket[],
  items: T[],
  dateOf: (item: T) => Date | null | undefined,
  valueOf: (item: T) => number = () => 1,
): { key: string; label: string; value: number }[] {
  const totals = buckets.map(() => 0);
  for (const item of items) {
    const d = dateOf(item);
    if (!d) continue;
    const t = d.getTime();
    // Buckets are sorted and contiguous: binary search for the one containing t.
    let lo = 0;
    let hi = buckets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < buckets[mid].start.getTime()) hi = mid - 1;
      else if (t >= buckets[mid].end.getTime()) lo = mid + 1;
      else {
        totals[mid] += valueOf(item);
        break;
      }
    }
  }
  return buckets.map((b, i) => ({ key: b.key, label: b.label, value: totals[i] }));
}

/** The serialisable part of a range that the client filter component needs. */
export type DateRangeState = Pick<DateRange, "key" | "label" | "from" | "to" | "error" | "min" | "max">;

export function rangeState(range: DateRange): DateRangeState {
  return { key: range.key, label: range.label, from: range.from, to: range.to, error: range.error, min: range.min, max: range.max };
}
