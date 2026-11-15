"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { ErrorState } from "@/components/states";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This admin page could not load"
      what="The server hit an error while loading this page. Nothing you entered was changed."
      fault="ours"
      fix="Try again. If it keeps failing, check that the database is running and look at the server log for the error."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <ButtonLink href="/admin" variant="secondary">
            Back to dashboard
          </ButtonLink>
        </div>
      }
    />
  );
}
