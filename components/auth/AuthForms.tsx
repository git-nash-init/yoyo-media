"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { cancelMfaAction, loginAction, registerAction, verifyMfaAction } from "@/lib/auth/actions";
import {
  checkField,
  confirmField,
  currentPasswordField,
  emailField,
  nameField,
  newPasswordField,
  totpCodeField,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/schemas";
import { useFormErrors } from "./useFormErrors";

const fieldValue = (form: HTMLFormElement, name: string) => {
  const el = form.elements.namedItem(name);
  return el instanceof HTMLInputElement ? el.value : "";
};

const loginValidators = {
  email: (v: string) => checkField(emailField, v),
  password: (v: string) => checkField(currentPasswordField, v),
};

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const { onBlur, errorFor, valueFor } = useFormErrors(state, loginValidators);
  const formError = state && !state.ok ? state.error : undefined;

  return (
    <form action={action} onBlur={onBlur} noValidate className="space-y-4">
      {formError ? <Alert>{formError}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={valueFor("email")}
        error={errorFor("email")}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={errorFor("password")}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

const registerValidators = {
  name: (v: string) => checkField(nameField, v),
  email: (v: string) => checkField(emailField, v),
  password: (v: string) => checkField(newPasswordField, v),
  confirm: (v: string, form: HTMLFormElement) =>
    checkField(confirmField, v) ?? (v !== fieldValue(form, "password") ? "The two passwords do not match." : null),
};

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(registerAction, null);
  const { onBlur, errorFor, valueFor } = useFormErrors(state, registerValidators);
  const formError = state && !state.ok ? state.error : undefined;

  return (
    <form action={action} onBlur={onBlur} noValidate className="space-y-4">
      {formError ? <Alert>{formError}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      <Field
        label="Name"
        name="name"
        autoComplete="name"
        required
        maxLength={60}
        defaultValue={valueFor("name")}
        error={errorFor("name")}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={valueFor("email")}
        error={errorFor("email")}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}
        error={errorFor("password")}
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={errorFor("confirm")}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

const codeValidators = { code: (v: string) => checkField(totpCodeField, v) };

export function MfaForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyMfaAction, null);
  const { onBlur, errorFor } = useFormErrors(state, codeValidators);
  const formError = state && !state.ok ? state.error : undefined;

  return (
    <div className="space-y-4">
      <form action={action} onBlur={onBlur} noValidate className="space-y-4">
        {formError ? <Alert>{formError}</Alert> : null}
        <input type="hidden" name="next" value={next} />
        <Field
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          placeholder="123456"
          hint="Open your authenticator app and enter the current code for YoYo Videos."
          error={errorFor("code")}
        />
        <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
          {pending ? "Checking…" : "Verify and continue"}
        </Button>
      </form>
      <form action={cancelMfaAction} className="text-center">
        <button type="submit" className="text-sm font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
          Use a different account
        </button>
      </form>
    </div>
  );
}
