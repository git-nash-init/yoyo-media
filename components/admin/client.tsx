"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Alert, Button } from "@/components/ui";
import type { ActionResult } from "@/lib/admin/logic";

/**
 * useActionState wrapper for admin forms. Submitting through onSubmit (instead of
 * the form `action` prop) keeps what the admin typed when the server returns field errors.
 */
export function useAdminForm<S extends ActionResult>(action: (prev: S | null, formData: FormData) => Promise<S>) {
  const [state, dispatch, pending] = useActionState<S | null, FormData>(action, null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  const errors: Record<string, string> = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return { state, pending, onSubmit, errors };
}

/** Form-level message under a form: error summary or success confirmation. */
export function FormStatus({ state }: { state: ActionResult | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state]);
  if (!state) return null;
  if (state.ok) return state.message ? <div ref={ref}><Alert tone="success">{state.message}</Alert></div> : null;
  return state.error ? <div ref={ref}><Alert>{state.error}</Alert></div> : null;
}

export function SubmitButton({ pending, children, pendingLabel = "Saving…" }: { pending: boolean; children: ReactNode; pendingLabel?: string }) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

/**
 * Button that runs a (bound) Server Action. With `confirm`, the first click only
 * reveals a confirm step, so destructive actions always take two deliberate clicks.
 */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "sm",
  confirm,
  confirmLabel = "Yes, do it",
  pendingLabel = "Working…",
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  /** Question shown before running, e.g. "Delete this video and its files? This cannot be undone." */
  confirm?: string;
  confirmLabel?: string;
  pendingLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setAsking(false);
    start(async () => {
      try {
        const res = await action();
        if (res && !res.ok) setError(res.error ?? "That did not work. Try again.");
      } catch (e) {
        // Next.js redirects thrown by the action must keep bubbling.
        if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
        setError("Could not reach the server. Check your connection and try again.");
      }
    });
  };

  if (asking && confirm) {
    return (
      <span className="inline-flex max-w-xs flex-col items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-2.5 text-left" role="alertdialog" aria-label="Confirm action">
        <span className="whitespace-normal text-xs text-fg">{confirm}</span>
        <span className="flex gap-2">
          <Button type="button" variant="danger" size="sm" onClick={run} autoFocus>
            {confirmLabel}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant={variant} size={size} disabled={pending} aria-busy={pending} onClick={() => (confirm ? setAsking(true) : run())}>
        {pending ? pendingLabel : children}
      </Button>
      {error ? (
        <span role="alert" className="max-w-[16rem] whitespace-normal text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Copy-to-clipboard button with visible confirmation. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2500);
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copied ✓" : state === "failed" ? "Select and copy manually" : label}</span>
    </Button>
  );
}
