"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { TrashIcon } from "@/components/shell/icons";
import { Skeleton, buttonClass } from "@/components/ui";
import { addCommentAction, deleteCommentAction, loadCommentsAction } from "@/lib/engagement/actions";
import type { CommentItem, Viewer } from "@/lib/engagement/types";
import { COMMENT_MAX, commentLength, validateCommentBody } from "@/lib/engagement/validation";
import { gateHref } from "./useLike";

type Row = CommentItem & {
  /** Optimistic row that is still being sent, or failed to send. */
  local?: "sending" | "failed";
  localError?: string;
};

// Each tone carries its own text colour so the initial stays readable in both themes
// (accent/success are bright in dark mode and deep in light mode, so they pair with text-bg).
const AVATAR_TONES = ["bg-brand text-white", "bg-accent text-bg", "bg-success text-bg", "bg-sky-700 text-white", "bg-violet-600 text-white"];
const toneFor = (name: string) => AVATAR_TONES[(name.charCodeAt(0) || 0) % AVATAR_TONES.length];

/**
 * Comment list + composer for one video.
 * `layout="sheet"` fills its container (scrolling list, composer pinned to the bottom);
 * `layout="inline"` flows with the page (composer first).
 * Comment bodies are rendered as plain text — React escapes them and nothing is linkified.
 */
export function CommentsPanel({
  videoId,
  viewer,
  viewerName,
  returnTo,
  layout = "sheet",
  onCountChange,
}: {
  videoId: string;
  viewer: Viewer;
  /** Shown on the viewer's own optimistic comment. */
  viewerName: string | null;
  returnTo: string;
  layout?: "sheet" | "inline";
  onCountChange?: (total: number) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const countCb = useRef(onCountChange);
  useEffect(() => {
    countCb.current = onCountChange;
  });

  const loadFirst = useCallback(async () => {
    try {
      const res = await loadCommentsAction({ videoId, cursor: null });
      if (!res.ok) {
        setLoadError(res.error);
        setStatus("error");
        return;
      }
      setRows(res.items);
      setCursor(res.nextCursor);
      setStatus("ready");
      countCb.current?.(res.total);
    } catch {
      setLoadError("We couldn't load comments. Check your connection.");
      setStatus("error");
    }
  }, [videoId]);

  useEffect(() => {
    const t = setTimeout(() => void loadFirst(), 0);
    return () => clearTimeout(t);
  }, [loadFirst]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await loadCommentsAction({ videoId, cursor });
      if (res.ok) {
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
        });
        setCursor(res.nextCursor);
        countCb.current?.(res.total);
      } else setMoreError(res.error);
    } catch {
      setMoreError("We couldn't load more comments. Check your connection.");
    } finally {
      setLoadingMore(false);
    }
  };

  // ---------- posting (optimistic) ----------
  const send = async (localId: string, body: string) => {
    setRows((prev) => prev.map((r) => (r.id === localId ? { ...r, local: "sending", localError: undefined } : r)));
    let error = "Couldn't post your comment. Check your connection.";
    try {
      const res = await addCommentAction({ videoId, body });
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === localId ? res.comment : r)));
        countCb.current?.(res.total);
        return;
      }
      error = res.error;
    } catch {
      // keep the default network message
    }
    setRows((prev) => prev.map((r) => (r.id === localId ? { ...r, local: "failed", localError: error } : r)));
  };

  const post = (body: string) => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setRows((prev) => [
      { id: localId, body, authorName: viewerName ?? "You", ago: "just now", canDelete: false, local: "sending" },
      ...prev,
    ]);
    void send(localId, body);
  };

  // ---------- deleting ----------
  const remove = async (id: string) => {
    setConfirmId(null);
    setRowError(null);
    const before = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await deleteCommentAction({ commentId: id });
      if (res.ok) {
        countCb.current?.(res.total);
        return;
      }
      setRowError(res.error);
    } catch {
      setRowError("Couldn't delete that comment. Check your connection.");
    }
    setRows(before);
  };

  const gate = gateHref(viewer, returnTo);
  const composer = gate ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
      <p className="text-sm text-muted">
        {viewer.signedIn ? "Commenting is for subscribers." : "Sign in to join the conversation."}
      </p>
      <Link href={gate} className={buttonClass("primary", "sm")}>
        {viewer.signedIn ? "Subscribe to comment" : "Sign in to comment"}
      </Link>
    </div>
  ) : (
    <Composer onPost={post} />
  );

  const list =
    status === "loading" ? (
      <ul className="space-y-5" aria-busy="true" aria-label="Loading comments">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex gap-3">
            <Skeleton className="h-9 w-9 shrink-0 !rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </li>
        ))}
      </ul>
    ) : status === "error" ? (
      <div role="alert" className="py-8 text-center">
        <p className="text-sm font-medium text-fg">Comments didn&apos;t load</p>
        <p className="mt-1 text-sm text-muted">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setStatus("loading");
            void loadFirst();
          }}
          className={buttonClass("secondary", "sm", "mt-4")}
        >
          Try again
        </button>
      </div>
    ) : rows.length === 0 ? (
      <p className="py-10 text-center text-sm text-muted">No comments yet. Be the first to say something.</p>
    ) : (
      <>
        {rowError ? (
          <p role="alert" className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {rowError}
          </p>
        ) : null}
        <ul className="space-y-5">
          {rows.map((c) => (
            <li key={c.id} className={`flex gap-3 ${c.local === "sending" ? "opacity-60" : ""}`}>
              <span
                aria-hidden="true"
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-medium ${toneFor(c.authorName)}`}
              >
                {(c.authorName.trim()[0] ?? "?").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                  <span className="max-w-full truncate text-sm font-medium text-fg">{c.authorName}</span>
                  <span>{c.local === "sending" ? "Posting…" : c.local === "failed" ? "Not posted" : c.ago}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg/90">{c.body}</p>

                {c.local === "failed" ? (
                  <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-danger">{c.localError}</span>
                    <button type="button" onClick={() => void send(c.id, c.body)} className="font-medium text-accent hover:underline">
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((r) => r.id !== c.id))}
                      className="font-medium text-muted hover:text-fg"
                    >
                      Discard
                    </button>
                  </div>
                ) : confirmId === c.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-fg">Delete this comment? This can&apos;t be undone.</span>
                    <button type="button" onClick={() => void remove(c.id)} className="font-medium text-danger hover:underline">
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="font-medium text-muted hover:text-fg">
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
              {c.canDelete && !c.local && confirmId !== c.id ? (
                <button
                  type="button"
                  onClick={() => setConfirmId(c.id)}
                  aria-label={`Delete comment by ${c.authorName}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                >
                  <TrashIcon size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {cursor ? (
          <div className="mt-6 flex flex-col items-center gap-2">
            {moreError ? (
              <p role="alert" className="text-sm text-danger">
                {moreError}
              </p>
            ) : null}
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={buttonClass("secondary", "sm")}>
              {loadingMore ? "Loading…" : moreError ? "Try again" : "Load more"}
            </button>
          </div>
        ) : null}
      </>
    );

  if (layout === "inline") {
    return (
      <div className="space-y-6">
        {composer}
        {list}
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{list}</div>
      <div className="border-t border-line p-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">{composer}</div>
    </div>
  );
}

function Composer({ onPost }: { onPost: (body: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const len = commentLength(value.trim());
  const over = len > COMMENT_MAX;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = validateCommentBody(value);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setValue("");
    onPost(res.body);
  };

  const message = over ? `${len - COMMENT_MAX} characters over the limit. Shorten your comment to post it.` : error;

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={id} className="sr-only">
        Add a comment
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
        }}
        rows={2}
        placeholder="Add a comment…"
        aria-invalid={message ? true : undefined}
        aria-describedby={`${id}-help`}
        className="block max-h-40 min-h-[4.25rem] w-full resize-y rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-muted/70 focus:border-brand aria-[invalid=true]:border-danger"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p id={`${id}-help`} className="min-w-0 text-xs" aria-live="polite">
          {message ? <span className="text-danger">{message}</span> : <span className="text-muted">Be kind. Plain text only.</span>}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`text-xs tabular-nums ${over ? "font-medium text-danger" : "text-muted"}`} aria-hidden="true">
            {len}/{COMMENT_MAX}
          </span>
          <button type="submit" disabled={over || len === 0} className={buttonClass("primary", "sm")}>
            Post
          </button>
        </div>
      </div>
    </form>
  );
}
