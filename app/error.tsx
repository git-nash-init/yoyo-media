"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui";

function digestOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const d = (error as { digest?: unknown }).digest;
    if (typeof d === "string" && d.length > 0) return d.slice(0, 64);
  }
  return null;
}

export default function AppError({
  error,
  retry,
  reset,
}: {
  error: unknown;
  /** Next.js 16: re-fetches and re-renders the failed segment. */
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    // Details stay in the console / server logs; the page never shows raw messages or stacks.
    console.error(error);
  }, [error]);

  const digest = digestOf(error);
  const tryAgain = retry ?? reset;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div>
        <ErrorState
          title="Something went wrong"
          what="We couldn't load this page."
          fault="ours"
          fix="Try again in a moment. If it keeps happening, head back home and try from there."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              {tryAgain ? (
                <Button type="button" onClick={() => tryAgain()}>
                  Try again
                </Button>
              ) : null}
              <ButtonLink href="/" variant="secondary">
                Go to home
              </ButtonLink>
            </div>
          }
        />
        {digest ? (
          <p className="-mt-8 pb-10 text-center text-xs text-muted">
            Reference code: <code className="font-mono text-fg/80">{digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  );
}
