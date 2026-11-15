"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useOnline } from "@/components/states/OfflineBanner";

/** "Try again" for the offline page: reloads the page, and does so automatically when the connection returns. */
export function RetryButton({ label = "Try again" }: { label?: string }) {
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onOnline = () => window.location.reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        size="lg"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          window.location.reload();
          // If the reload lands back here (still offline), re-enable shortly.
          setTimeout(() => setBusy(false), 4000);
        }}
      >
        {busy ? "Checking…" : label}
      </Button>
      <p className="text-xs text-muted" role="status">
        {online ? "Connection detected — retry now." : "We'll reload automatically when you're back online."}
      </p>
    </div>
  );
}

export default RetryButton;
