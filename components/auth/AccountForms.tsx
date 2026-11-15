"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import {
  changePasswordAction,
  confirmMfaSetupAction,
  disableMfaAction,
  logoutAction,
  logoutOthersAction,
  startMfaSetupAction,
  updateNameAction,
} from "@/lib/auth/actions";
import {
  checkField,
  confirmField,
  currentPasswordField,
  nameField,
  newPasswordField,
  totpCodeField,
  PASSWORD_MIN_LENGTH,
  type ActionState,
} from "@/lib/auth/schemas";
import { useFormErrors } from "./useFormErrors";

const fieldValue = (form: HTMLFormElement, name: string) => {
  const el = form.elements.namedItem(name);
  return el instanceof HTMLInputElement ? el.value : "";
};

function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.ok) return state.message ? <Alert tone="success">{state.message}</Alert> : null;
  return state.error ? <Alert>{state.error}</Alert> : null;
}

const nameValidators = { name: (v: string) => checkField(nameField, v) };

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateNameAction, null);
  const { onBlur, errorFor, valueFor } = useFormErrors(state, nameValidators);
  return (
    <form action={action} onBlur={onBlur} noValidate className="space-y-4">
      <FormMessage state={state} />
      <Field
        label="Display name"
        name="name"
        autoComplete="name"
        required
        maxLength={60}
        data-draft
        defaultValue={valueFor("name", name)}
        error={errorFor("name")}
      />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

const passwordValidators = {
  currentPassword: (v: string) => checkField(currentPasswordField, v),
  newPassword: (v: string, form: HTMLFormElement) =>
    checkField(newPasswordField, v) ??
    (v === fieldValue(form, "currentPassword") ? "Choose a password that is different from your current one." : null),
  confirm: (v: string, form: HTMLFormElement) =>
    checkField(confirmField, v) ?? (v !== fieldValue(form, "newPassword") ? "The two passwords do not match." : null),
};

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const { onBlur, errorFor } = useFormErrors(state, passwordValidators);
  return (
    <form action={action} onBlur={onBlur} noValidate className="space-y-4">
      <FormMessage state={state} />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={errorFor("currentPassword")}
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
        error={errorFor("newPassword")}
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={errorFor("confirm")}
      />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}

export function SessionButtons({ otherSessions }: { otherSessions: number }) {
  const [state, action, pending] = useActionState(logoutOthersAction, null);
  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <form action={logoutAction}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
        <form action={action}>
          <Button type="submit" variant="danger" disabled={pending || otherSessions === 0} aria-busy={pending}>
            {pending ? "Signing out…" : "Sign out of other devices"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function StartMfaButton({ label = "Set up authenticator app", variant = "primary" as "primary" | "secondary" }) {
  const [state, action, pending] = useActionState(startMfaSetupAction, null);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>
        {pending ? "Preparing…" : label}
      </Button>
    </form>
  );
}

const codeValidators = { code: (v: string) => checkField(totpCodeField, v) };

export function ConfirmMfaForm() {
  const [state, action, pending] = useActionState(confirmMfaSetupAction, null);
  const { onBlur, errorFor } = useFormErrors(state, codeValidators);
  return (
    <form action={action} onBlur={onBlur} noValidate className="space-y-4">
      <FormMessage state={state} />
      <Field
        label="6-digit code from the app"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        placeholder="123456"
        error={errorFor("code")}
      />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Checking…" : "Turn on two-step sign-in"}
      </Button>
    </form>
  );
}

const disableValidators = { currentPassword: (v: string) => checkField(currentPasswordField, v) };

export function DisableMfaForm() {
  const [state, action, pending] = useActionState(disableMfaAction, null);
  const { onBlur, errorFor } = useFormErrors(state, disableValidators);
  return (
    <form action={action} onBlur={onBlur} noValidate className="space-y-4">
      <FormMessage state={state} />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        hint="We ask for your password so nobody else can switch this off."
        error={errorFor("currentPassword")}
      />
      <Button type="submit" variant="danger" disabled={pending} aria-busy={pending}>
        {pending ? "Turning off…" : "Turn off two-step sign-in"}
      </Button>
    </form>
  );
}
