"use client";

import { useState } from "react";
import { Alert, Button, Card, Field } from "@/components/ui";
import { ActionButton, CopyButton, SubmitButton, useAdminForm } from "@/components/admin/client";
import { createIngestTokenAction, revokeIngestTokenAction } from "@/lib/admin/actions/misc";

export function TokenCreate({ siteUrl }: { siteUrl: string }) {
  const { state, pending, onSubmit, errors } = useAdminForm(createIngestTokenAction);
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);
  const token = state?.ok && state.token && state.token !== dismissedToken ? state.token : null;

  if (token) {
    const envText = `STUDIO_SITE_URL=${siteUrl}\nSTUDIO_TOKEN=${token}`;
    return (
      <Card className="space-y-4 border-success/40 p-5" role="status">
        <div>
          <h2 className="text-base font-medium text-fg">Token created{state?.ok && state.name ? `: ${state.name}` : ""}</h2>
          <p className="mt-1 text-sm text-warning">Copy it now. For security it is shown only this once and cannot be recovered later.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 select-all break-all rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-sm text-fg">{token}</code>
          <CopyButton text={token} label="Copy token" />
        </div>
        <div className="space-y-2 text-sm text-muted">
          <p className="font-medium text-fg">Next: connect YoYo Studio</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              On the PC that has the videos, open <code className="font-mono text-fg">tools/studio/.env</code> (create the file if it does not exist).
            </li>
            <li>Paste these two lines and save:</li>
          </ol>
          <div className="flex flex-wrap items-start gap-3">
            <pre className="min-w-0 flex-1 select-all overflow-x-auto rounded-xl border border-line bg-bg px-3 py-2.5 font-mono text-xs text-fg">{envText}</pre>
            <CopyButton text={envText} label="Copy lines" />
          </div>
          <ol className="list-decimal space-y-1 pl-5" start={3}>
            <li>
              Run <code className="font-mono text-fg">npm run studio</code> in the project folder. Processed videos arrive here as drafts.
            </li>
          </ol>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setDismissedToken(token)}>
          I have saved the token
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-medium text-fg">Create a token</h2>
      <p className="mt-1 text-sm text-muted">One token per PC is a good habit: if a machine is lost you can revoke just that one.</p>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-wrap items-start gap-3">
        <Field label="Token name" name="name" required maxLength={60} placeholder="e.g. Office editing PC" error={errors.name} className="min-w-[14rem] flex-1 sm:max-w-sm" />
        <div className="pt-[1.85rem]">
          <SubmitButton pending={pending} pendingLabel="Creating…">
            Create token
          </SubmitButton>
        </div>
      </form>
      {state && !state.ok && state.error ? (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
    </Card>
  );
}

export function RevokeTokenButton({ id, name }: { id: string; name: string }) {
  return (
    <ActionButton
      action={revokeIngestTokenAction.bind(null, id)}
      variant="danger"
      confirm={`Revoke "${name}"? YoYo Studio on that PC stops working until you give it a new token.`}
      confirmLabel="Yes, revoke"
      pendingLabel="Revoking…"
    >
      Revoke
    </ActionButton>
  );
}
