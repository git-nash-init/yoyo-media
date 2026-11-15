"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui";

/** Error boundary for every viewer-facing page. `retry` re-fetches and re-renders the segment. */
export default function AppError({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <ErrorState
        title={offline ? "You are offline" : "This page did not load"}
        what={
          offline
            ? "We could not reach YoYo Videos because your device is not connected."
            : "Something broke while loading this page."
        }
        fault={offline ? "network" : "ours"}
        fix={
          offline
            ? "Check your connection, then try again."
            : "Try again in a moment. If it keeps happening, go back to the home page."
        }
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" onClick={() => (retry ?? reset)?.()}>
              Try again
            </Button>
            <ButtonLink href="/browse" variant="secondary">
              Go to home
            </ButtonLink>
          </div>
        }
      />
      {digest ? <p className="text-center text-xs text-muted">Reference: {digest}</p> : null}
    </div>
  );
}
