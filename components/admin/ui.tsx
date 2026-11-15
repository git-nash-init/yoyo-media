import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Badge, Card, Skeleton, buttonClass, cn, inputClass } from "@/components/ui";
import { buildQuery } from "@/lib/admin/logic";

// Server-safe building blocks for admin pages (no hooks, usable from client components too).

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-medium text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  badge,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  /** Small tag next to the label, e.g. "Now" for point-in-time numbers that ignore the date filter. */
  badge?: string;
}) {
  const body = (
    <Card className={cn("h-full p-4", href && "transition-colors hover:border-brand/60")}>
      <p className="flex items-center gap-2 text-xs font-medium text-muted">
        <span>{label}</span>
        {badge ? <span className="rounded-lg border border-line bg-surface-2 px-1.5 py-px text-[10px] font-medium normal-case tracking-normal text-muted">{badge}</span> : null}
      </p>
      <p className="mt-2 text-2xl font-medium tabular-nums text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-medium text-fg">{children}</h2>
      {action}
    </div>
  );
}

// ---------- Tables ----------

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm" aria-label={label}>
        {children}
      </table>
    </Card>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("border-b border-line px-4 py-3 text-xs font-medium text-muted", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-line/60 px-4 py-3 align-middle text-fg", className)}>{children}</td>;
}

/** Loading skeleton in the shape of an admin table page (header, filter bar, rows). */
export function TablePageSkeleton({ rows = 8, withThumb = false }: { rows?: number; withThumb?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 !rounded-full" />
      </div>
      <Skeleton className="mb-4 h-11 w-full max-w-xl" />
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <Skeleton className="h-3 w-1/3" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line/60 px-4 py-3">
            {withThumb ? <Skeleton className="h-12 w-20 shrink-0" /> : null}
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-20 sm:block" />
            <Skeleton className="hidden h-4 w-16 sm:block" />
            <Skeleton className="h-8 w-24 !rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}

/** Loading skeleton in the shape of an edit form. */
export function FormPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Card className="max-w-3xl space-y-5 p-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-32 !rounded-full" />
      </Card>
    </div>
  );
}

// ---------- Pagination & filters ----------

export function Pagination({
  page,
  pages,
  total,
  basePath,
  params = {},
}: {
  page: number;
  pages: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (p: number) => `${basePath}${buildQuery({ ...params, page: p })}`;
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted" aria-label="Pagination">
      <p>
        Page {page} of {pages} · {total.toLocaleString("en-IN")} total
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass("secondary", "sm")} rel="prev">
            ← Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass("secondary", "sm")} rel="next">
            Next →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** GET filter form: works without JavaScript and keeps filters in the URL. */
export function FilterBar({
  action,
  children,
  clearHref,
  keep = {},
}: {
  action: string;
  children: ReactNode;
  clearHref?: string;
  /** Params to carry through the GET submit as hidden inputs (e.g. the date range). */
  keep?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {children}
      <button type="submit" className={buttonClass("secondary", "md")}>
        Apply
      </button>
      {clearHref ? (
        <Link href={clearHref} className={buttonClass("ghost", "md")}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}

export function FilterInput({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className={cn("block min-w-[12rem] flex-1 sm:max-w-xs", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input className={cn(inputClass, "h-10")} {...props} />
    </label>
  );
}

export function FilterSelect({ label, children, ...props }: ComponentProps<"select"> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <select className={cn(inputClass, "h-10 w-auto min-w-[9rem] pr-8")} {...props}>
        {children}
      </select>
    </label>
  );
}

// ---------- Form fields (same look as <Field> from components/ui) ----------

function FieldShell({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export function TextareaField({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: ComponentProps<"textarea"> & { label: string; name: string; error?: string; hint?: string }) {
  const id = props.id ?? `f-${name}`;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <textarea
        id={id}
        name={name}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(inputClass, "h-auto min-h-[6rem] py-2.5")}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  className,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; name: string; error?: string; hint?: string }) {
  const id = props.id ?? `f-${name}`;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClass}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; name: string; hint?: string }) {
  const id = props.id ?? `f-${name}`;
  return (
    <div className="flex items-start gap-3">
      <input id={id} name={name} type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-brand)]" {...props} />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

// ---------- Badges & small bits ----------

export function VideoStatusBadge({ status }: { status: "DRAFT" | "PUBLISHED" }) {
  return status === "PUBLISHED" ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>;
}

export function PaymentStatusBadge({ status }: { status: "PENDING" | "PAID" | "FAILED" }) {
  if (status === "PAID") return <Badge tone="success">Paid</Badge>;
  if (status === "FAILED") return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="warning">Pending</Badge>;
}

export function SubStateBadge({ state }: { state: "active" | "expired" | "never" }) {
  if (state === "active") return <Badge tone="success">Active</Badge>;
  if (state === "expired") return <Badge tone="danger">Expired</Badge>;
  return <Badge>Never subscribed</Badge>;
}

/** Plain <img>: admin artwork is served by /api/media, which already handles caching. */
export function Thumb({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" className={cn("bg-surface-2 object-cover", className)} />
  );
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const DATETIME_FMT = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
export const fmtDate = (d: Date | null | undefined) => (d ? DATE_FMT.format(d) : "—");
export const fmtDateTime = (d: Date | null | undefined) => (d ? DATETIME_FMT.format(d) : "—");

/**
 * Simple CSS bar chart: one column per bucket (hour, day or month), value on hover and in a
 * visually hidden table for screen readers. Bars use brand/success tokens, so they read in both themes.
 */
export function BarChart({
  data,
  format = (n) => String(n),
  label,
  tone = "brand",
  period,
}: {
  data: { key: string; label: string; value: number }[];
  format?: (n: number) => string;
  label: string;
  tone?: "brand" | "success";
  /** Describes the span for screen readers, e.g. "this week, by day". */
  period: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  const dense = data.length > 31;
  return (
    <figure>
      <div className={cn("flex h-36 items-end border-b border-line", dense ? "gap-px" : "gap-1")} role="img" aria-label={`${label}: ${format(total)} ${period}`}>
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${d.label}: ${format(d.value)}`}>
            <div
              className={cn(
                "w-full rounded-t-[3px] transition-opacity group-hover:opacity-80",
                d.value === 0 ? "bg-line" : tone === "brand" ? "bg-brand" : "bg-success",
              )}
              style={{ height: d.value === 0 ? "3px" : `${Math.max(4, (d.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between gap-2 text-xs text-muted">
        <span>{data[0]?.label}</span>
        <span>
          {label}: <span className="font-medium text-fg">{format(total)}</span>
        </span>
        <span>{data[data.length - 1]?.label}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{`${label} ${period}`}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
