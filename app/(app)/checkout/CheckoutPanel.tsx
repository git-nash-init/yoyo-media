"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import { payTestAction } from "./actions";

export function CheckoutPanel({ priceLabel, next }: { priceLabel: string; next: string }) {
  const [state, action, pending] = useActionState(payTestAction, null);
  const error = state && !state.ok ? state.error : undefined;

  return (
    <section
      aria-labelledby="test-payment-title"
      className="rounded-xl border border-dashed border-accent/60 bg-accent/5 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" />
          </svg>
        </span>
        <div>
          <h2 id="test-payment-title" className="font-medium text-fg">
            Test payment — no real money is charged
          </h2>
          <p className="mt-1 text-sm text-muted">
            This is a demonstration checkout. No card or bank details are needed. Pick an outcome to try.
          </p>
        </div>
      </div>

      <form action={action} className="mt-5 space-y-3">
        {error ? <Alert>{error}</Alert> : null}
        <input type="hidden" name="next" value={next} />
        <Button type="submit" name="outcome" value="succeeded" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
          {pending ? "Processing…" : `Pay ${priceLabel} (test)`}
        </Button>
        <Button type="submit" name="outcome" value="failed" variant="secondary" className="w-full" disabled={pending}>
          Simulate failed payment
        </Button>
        <p role="status" className="min-h-5 text-center text-xs text-muted">
          {pending ? "Confirming with the payment provider. Please keep this page open." : ""}
        </p>
      </form>
    </section>
  );
}
