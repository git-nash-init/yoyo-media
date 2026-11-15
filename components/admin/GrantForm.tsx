"use client";

import { Field } from "@/components/ui";
import { ActionButton, FormStatus, SubmitButton, useAdminForm } from "@/components/admin/client";
import { grantSubscriptionAction, revokeSubscriptionAction } from "@/lib/admin/actions/misc";

export function GrantForm({ userId, defaultDays }: { userId: string; defaultDays: number }) {
  const { state, pending, onSubmit, errors } = useAdminForm(grantSubscriptionAction.bind(null, userId));
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label="Days" name="days" type="number" inputMode="numeric" min={1} max={3650} defaultValue={defaultDays} required error={errors.days} />
        <Field label="Note" name="note" maxLength={200} placeholder="e.g. Paid in cash, contest winner" error={errors.note} hint="Optional. Saved with the subscription so you remember why." />
      </div>
      <FormStatus state={state} />
      <SubmitButton pending={pending} pendingLabel="Granting…">
        Grant access
      </SubmitButton>
    </form>
  );
}

export function RevokeButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ActionButton
      action={revokeSubscriptionAction.bind(null, userId)}
      variant="danger"
      size="md"
      confirm={`Revoke access for ${name}? All their active subscriptions are cancelled immediately. Payments are not refunded.`}
      confirmLabel="Yes, revoke"
      pendingLabel="Revoking…"
    >
      Revoke access
    </ActionButton>
  );
}
