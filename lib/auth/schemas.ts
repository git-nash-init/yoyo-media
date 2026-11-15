// Pure validation schemas shared by Server Actions and client-side blur checks.
// No server-only imports here: this file is bundled into client components.
import { z } from "zod";

/** Result shape of every form Server Action (used with `useActionState`). */
export type ActionState =
  | { ok: true; message?: string }
  | {
      ok: false;
      error?: string;
      fieldErrors?: Record<string, string>;
      /** Non-secret values echoed back so the form keeps what the user typed. */
      values?: Record<string, string>;
    }
  | null;

export const PASSWORD_MIN_LENGTH = 10;

/**
 * Client-safe mirror of `passwordProblem` in lib/auth/password.ts (which is
 * server-only). The server always re-checks with `passwordProblem`.
 */
export function passwordIssue(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (pw.length > 200) return "Password is too long.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Include at least one letter and one number.";
  return null;
}

export const nameField = z
  .string({ error: "Enter your name." })
  .trim()
  .min(2, "Enter your name (at least 2 characters).")
  .max(60, "Keep your name under 60 characters.");

export const emailField = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(191, "That email address is too long.")
  .pipe(z.email("Enter a valid email address, like name@example.com."));

export const newPasswordField = z.string({ error: "Choose a password." }).superRefine((pw, ctx) => {
  const issue = passwordIssue(pw);
  if (issue) ctx.addIssue({ code: "custom", message: issue });
});

/** An existing password: only check it is present and sane in size. */
export const currentPasswordField = z
  .string({ error: "Enter your password." })
  .min(1, "Enter your password.")
  .max(200, "Password is too long.");

export const totpCodeField = z
  .string({ error: "Enter the 6-digit code." })
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."));

export const confirmField = z.string({ error: "Re-enter the password." }).min(1, "Re-enter the password.");

export const nextField = z.string().max(2000).optional();

export const registerSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: newPasswordField,
    confirm: confirmField,
    next: nextField,
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords do not match." });

export const loginSchema = z.object({
  email: emailField,
  password: currentPasswordField,
  next: nextField,
});

export const mfaSchema = z.object({ code: totpCodeField, next: nextField });

export const updateNameSchema = z.object({ name: nameField });

export const changePasswordSchema = z
  .object({
    currentPassword: currentPasswordField,
    newPassword: newPasswordField,
    confirm: confirmField,
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "The two passwords do not match." })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password that is different from your current one.",
  });

export const confirmMfaSchema = z.object({ code: totpCodeField });
export const disableMfaSchema = z.object({ currentPassword: currentPasswordField });

/** First error message per field from a zod error. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Validate one value against one field schema; returns the message or null. */
export function checkField(schema: z.ZodType, value: unknown): string | null {
  const r = schema.safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? "Check this field.");
}
