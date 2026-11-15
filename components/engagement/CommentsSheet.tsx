"use client";

import { useRef } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { useFocusTrap } from "@/components/shell/useFocusTrap";
import type { Viewer } from "@/lib/engagement/types";
import { CommentsPanel } from "./CommentsPanel";
import { formatCount } from "./useLike";

/**
 * Comments as a modal: a bottom sheet on phones, a right-hand side panel on
 * desktop. Focus is trapped inside, Escape and the backdrop close it.
 */
export function CommentsSheet({
  videoId,
  title,
  count,
  viewer,
  viewerName,
  returnTo,
  onClose,
  onCountChange,
}: {
  videoId: string;
  title: string;
  count: number;
  viewer: Viewer;
  viewerName: string | null;
  returnTo: string;
  onClose: () => void;
  onCountChange: (total: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Comments on ${title}`}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex h-[72dvh] flex-col rounded-t-3xl border border-line bg-surface shadow-2xl outline-none animate-fade-in md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[420px] md:rounded-none md:border-y-0 md:border-r-0"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden="true" />
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-medium text-fg">
            Comments <span className="font-medium text-muted">{formatCount(count)}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label="Close comments"
            className="grid h-9 w-9 place-items-center rounded-full text-fg hover:bg-surface-2"
          >
            <CloseIcon size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <CommentsPanel
            key={videoId}
            videoId={videoId}
            viewer={viewer}
            viewerName={viewerName}
            returnTo={returnTo}
            onCountChange={onCountChange}
          />
        </div>
      </div>
    </div>
  );
}
