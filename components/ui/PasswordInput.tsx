"use client";

import { useState, type ComponentProps } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/shell/icons";

/**
 * Password input with a show / hide button. Used by every password field through `Field`.
 * The button never submits the form, and pressing it keeps the caret in the input.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={`${className ?? ""} pr-11`} />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted transition-colors hover:text-fg focus-visible:text-fg"
      >
        {shown ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}
