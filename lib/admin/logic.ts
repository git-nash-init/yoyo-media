// Pure admin helpers (validation, slugs, pagination, chart buckets).
// No server-only imports here so this file can be unit tested and used in client components.
import { z } from "zod";
import { slugify } from "../format";

/** Result shape shared by every admin Server Action. */
export type ActionResult<T extends object = object> =
  | ({ ok: true; message?: string } & T)
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export const STORAGE_CAP_BYTES = 50 * 1024 * 1024 * 1024;
/** Cap for the in-browser fallback upload. Bigger files go through YoYo Studio. */
export const MAX_SMALL_UPLOAD_BYTES = 500 * 1024 * 1024;
export const PAGE_SIZE = 20;

// ---------- Slugs ----------

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Turn any text into a URL-safe slug: lowercase a-z, 0-9 and single hyphens, max 80 chars. */
export function normalizeSlug(input: string): string {
  const s = slugify(input)
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 80 && SLUG_RE.test(slug);
}

/** Use the typed slug when given (normalized), otherwise derive one from the title. */
export function resolveSlug(rawSlug: string | null | undefined, title: string): string {
  const typed = (rawSlug ?? "").trim();
  return normalizeSlug(typed || title);
}

/** n = 0 gives the base; n = 1 gives "base-2", and so on. Always stays within 80 chars. */
export function slugCandidate(base: string, n: number): string {
  if (n <= 0) return base;
  const suffix = `-${n + 1}`;
  return `${base.slice(0, 80 - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

// ---------- Zod helpers ----------

/** First message per top-level field, for inline form errors. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

const trimmed = (max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .transform((v) => (v ? v : null));

const optionalId = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => (v ? v : null));

const slugInput = z
  .string()
  .trim()
  .max(80, "Slug must be 80 characters or fewer.")
  .optional()
  .transform((v) => v ?? "");

export const idSchema = z.string().min(1).max(40).regex(/^[a-z0-9]+$/i);

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("false"), z.literal("0"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

// ---------- Video ----------

export const videoFormSchema = z
  .object({
    title: trimmed(150, "Title").min(2, "Give the video a title (at least 2 characters)."),
    slug: slugInput,
    description: optionalText(5000, "Description"),
    type: z.enum(["LONG", "SHORT"], { error: "Choose Video or Short." }),
    status: z.enum(["DRAFT", "PUBLISHED"], { error: "Choose Draft or Published." }),
    channelId: optionalId,
    seriesId: optionalId,
    episodeNo: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 9999), {
        message: "Episode number must be a whole number between 1 and 9999.",
      }),
    modelIds: z.array(idSchema).max(50, "Pick at most 50 models.").default([]),
    isFeatured: checkbox,
  })
  .superRefine((v, ctx) => {
    if (v.episodeNo !== null && !v.seriesId) {
      ctx.addIssue({ code: "custom", path: ["episodeNo"], message: "Pick a series first, or clear the episode number." });
    }
    const slug = resolveSlug(v.slug, v.title);
    if (!isValidSlug(slug)) {
      ctx.addIssue({ code: "custom", path: ["slug"], message: "Use lowercase letters, numbers and hyphens only." });
    }
  });

export const uploadMetaSchema = z.object({
  title: trimmed(150, "Title").min(2, "Give the video a title (at least 2 characters)."),
  type: z.enum(["LONG", "SHORT"]),
  duration: z.coerce.number().min(0).max(86400).default(0),
});

/** Vertical and 90 seconds or shorter ⇒ suggest a Short. */
export function suggestVideoType(width: number, height: number, durationSec: number): "LONG" | "SHORT" {
  return height > width && durationSec > 0 && durationSec <= 90 ? "SHORT" : "LONG";
}

// ---------- Channels / Models / Series ----------

export const taxonomySchema = z.object({
  name: trimmed(80, "Name").min(2, "Enter a name (at least 2 characters)."),
  slug: slugInput,
  description: optionalText(2000, "Description"),
  sortOrder: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : 0))
    .refine((v) => Number.isInteger(v) && v >= -9999 && v <= 9999, {
      message: "Sort order must be a whole number between -9999 and 9999.",
    }),
  channelId: optionalId,
});

// ---------- Settings ----------

export const WATERMARK_POSITIONS = ["top-right", "top-left", "bottom-right", "bottom-left"] as const;

export const settingsSchema = z.object({
  price_rupees: z
    .string({ error: "Enter a price." })
    .trim()
    .regex(/^\d{1,6}(\.\d{1,2})?$/, "Enter a price in rupees, for example 999 or 499.50.")
    .transform(Number)
    .refine((v) => v >= 1 && v <= 100000, { message: "Price must be between ₹1 and ₹1,00,000." }),
  plan_days: z
    .string({ error: "Enter the plan length." })
    .trim()
    .regex(/^\d{1,4}$/, "Plan length must be a whole number of days.")
    .transform(Number)
    .refine((v) => v >= 1 && v <= 3650, { message: "Plan length must be between 1 and 3650 days." }),
  watermark_enabled: checkbox,
  watermark_position: z.enum(WATERMARK_POSITIONS, { error: "Choose one of the four corners." }),
  hero_title: trimmed(120, "Hero title").min(3, "Hero title needs at least 3 characters."),
  hero_subtitle: trimmed(240, "Hero subtitle").min(3, "Hero subtitle needs at least 3 characters."),
});

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupeesInput(paise: number | string): string {
  const n = Number(paise) || 0;
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

/** Validated settings converted to the string values stored in the Setting table. */
export function settingsToStored(v: z.infer<typeof settingsSchema>) {
  return {
    price_paise: String(rupeesToPaise(v.price_rupees)),
    plan_days: String(v.plan_days),
    watermark_enabled: v.watermark_enabled ? "true" : "false",
    watermark_position: v.watermark_position,
    hero_title: v.hero_title,
    hero_subtitle: v.hero_subtitle,
  } as const;
}

// ---------- Subscribers / tokens ----------

export const grantSchema = z.object({
  days: z
    .string({ error: "Enter the number of days." })
    .trim()
    .regex(/^\d{1,4}$/, "Days must be a whole number.")
    .transform(Number)
    .refine((v) => v >= 1 && v <= 3650, { message: "Days must be between 1 and 3650." }),
  note: optionalText(200, "Note"),
});

export const tokenNameSchema = z.object({
  name: trimmed(60, "Name").min(2, "Name the token so you can recognise it later (e.g. “Office PC”)."),
});

/** New expiry for a manual grant: stacks on top of time the user already has. */
export function grantExpiry(now: Date, currentExpiry: Date | null, days: number): Date {
  const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return new Date(base.getTime() + days * 86_400_000);
}

// ---------- Pagination ----------

export function parsePage(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function firstParam(raw: string | string[] | undefined, max = 100): string {
  return ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim().slice(0, max);
}

/** Build a query string, dropping empty values. */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && !(k === "page" && Number(v) === 1)) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---------- Dashboard chart buckets ----------

const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day (YYYY-MM-DD) in India time. */
export function dayKey(d: Date): string {
  return DAY_FMT.format(d);
}

/** The last `n` day keys ending today, oldest first. */
export function lastNDays(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(now.getTime() - (n - 1 - i) * 86_400_000)));
}

/** Sum `value` per day for the given day keys; days with no items are 0. */
export function bucketByDay<T>(
  days: string[],
  items: T[],
  dateOf: (item: T) => Date | null | undefined,
  valueOf: (item: T) => number = () => 1,
): { day: string; value: number }[] {
  const totals = new Map(days.map((d) => [d, 0]));
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    const key = dayKey(date);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + valueOf(item));
  }
  return days.map((day) => ({ day, value: totals.get(day) ?? 0 }));
}

export type SubState = "active" | "expired" | "never";

/** Plan status of a user from their subscriptions. */
export function subscriptionState(
  subs: { status: string; expiresAt: Date }[],
  now = new Date(),
): { state: SubState; expiresAt: Date | null } {
  if (subs.length === 0) return { state: "never", expiresAt: null };
  const active = subs
    .filter((s) => s.status === "ACTIVE" && s.expiresAt.getTime() > now.getTime())
    .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
  if (active) return { state: "active", expiresAt: active.expiresAt };
  const latest = [...subs].sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
  return { state: "expired", expiresAt: latest.expiresAt };
}
