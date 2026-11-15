import type { ReactNode } from "react";
import { ButtonLink, Skeleton, cn } from "@/components/ui";
import { renderIcon } from "@/components/ui/line-icon";

/**
 * Shared UI-state components. Every list/page must handle: empty, loading,
 * error, no-results and permission-denied with these.
 */

function Shell({ icon, title, children, className }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center animate-fade-in", className)}>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg border border-line bg-surface-2 text-muted" aria-hidden>
        {renderIcon(icon)}
      </div>
      <h2 className="text-lg font-medium text-fg">{title}</h2>
      {children}
    </div>
  );
}

/** Empty state: say why it is empty, then give ONE clear next step. */
export function EmptyState({
  icon = "🎬",
  title,
  reason,
  actionHref,
  actionLabel,
}: {
  icon?: ReactNode;
  title: string;
  reason: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <Shell icon={icon} title={title}>
      <p className="mt-2 text-sm text-muted">{reason}</p>
      {actionHref && actionLabel ? (
        <ButtonLink href={actionHref} className="mt-6">
          {actionLabel}
        </ButtonLink>
      ) : null}
    </Shell>
  );
}

/** Error state: what went wrong, whose side it was on, and how to fix it. `action` is usually a retry button. */
export function ErrorState({
  title = "Something went wrong",
  what,
  fault = "ours",
  fix,
  action,
}: {
  title?: string;
  what: string;
  fault?: "ours" | "yours" | "network";
  fix: string;
  action?: ReactNode;
}) {
  const faultText = {
    ours: "This is a problem on our side, not something you did.",
    yours: "This needs a small change from you.",
    network: "This looks like a connection problem.",
  }[fault];
  return (
    <Shell icon="⚠️" title={title}>
      <p className="mt-2 text-sm text-fg">{what}</p>
      <p className="mt-1 text-sm text-muted">
        {faultText} {fix}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Shell>
  );
}

/** Permission-denied state: explain why access is blocked and give a way forward. */
export function PermissionDenied({
  title,
  reason,
  actionHref,
  actionLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  reason: string;
  actionHref: string;
  actionLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <Shell icon="🔒" title={title}>
      <p className="mt-2 text-sm text-muted">{reason}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink href={actionHref}>{actionLabel}</ButtonLink>
        {secondaryHref && secondaryLabel ? (
          <ButtonLink href={secondaryHref} variant="secondary">
            {secondaryLabel}
          </ButtonLink>
        ) : null}
      </div>
    </Shell>
  );
}

/** Success state: confirm, reassure, then show what happens next. */
export function SuccessState({
  title,
  message,
  next,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  next?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <Shell icon="✅" title={title}>
      <p className="mt-2 text-sm text-fg">{message}</p>
      {next ? <p className="mt-1 text-sm text-muted">{next}</p> : null}
      {actionHref && actionLabel ? (
        <ButtonLink href={actionHref} className="mt-6">
          {actionLabel}
        </ButtonLink>
      ) : null}
    </Shell>
  );
}

/** Loading skeleton in the shape of a video grid. */
export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading videos">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-video w-full" />
          <div className="flex gap-3">
            <Skeleton className="h-9 w-9 shrink-0 !rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading skeleton in the shape of a poster/avatar grid (series, models). */
export function TileGridSkeleton({ count = 12, round = false }: { count?: number; round?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className={cn("w-full", round ? "aspect-square !rounded-full" : "aspect-[3/4]")} />
          <Skeleton className="mx-auto h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
