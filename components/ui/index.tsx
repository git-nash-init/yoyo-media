import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { PasswordInput } from "./PasswordInput";

/** Tiny className joiner. */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "btn inline-flex items-center justify-center gap-2 rounded-lg font-medium disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export const inputClass =
  "w-full h-11 rounded-lg bg-surface border border-line px-3.5 text-fg placeholder:text-muted/70 outline-none transition-colors focus:border-accent aria-[invalid=true]:border-danger";

/**
 * Labelled form field with inline error text (form-validation state).
 * Pass `error` to flag this exact field and say how to fix it.
 */
export function Field({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; name: string; error?: string; hint?: string }) {
  const id = props.id ?? `f-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {props.type === "password" ? (
        <PasswordInput
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={inputClass}
          {...props}
        />
      ) : (
        <input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={inputClass}
          {...props}
        />
      )}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl bg-surface border border-line", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand" | "success" | "danger" | "warning";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted border-line",
    brand: "bg-brand-soft text-accent border-accent/30",
    success: "bg-success/15 text-success border-success/40",
    danger: "bg-danger/15 text-danger border-danger/40",
    warning: "bg-warning/15 text-warning border-warning/40",
  };
  return (
    <span className={cn("inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

/** Loading-state building block. Compose these into the shape of the content that is coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/** Inline form-level message (error or success). */
export function Alert({ tone = "danger", children }: { tone?: "danger" | "success" | "warning"; children: ReactNode }) {
  const tones = {
    danger: "bg-danger/10 border-danger/40 text-danger",
    success: "bg-success/10 border-success/40 text-success",
    warning: "bg-warning/10 border-warning/40 text-warning",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
