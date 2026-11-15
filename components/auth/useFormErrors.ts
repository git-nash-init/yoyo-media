"use client";

import { useCallback, useState, type FocusEvent } from "react";
import type { ActionState } from "@/lib/auth/schemas";

type Validator = (value: string, form: HTMLFormElement) => string | null;

/**
 * Inline validation for forms driven by `useActionState`.
 * - Server field errors show until the user leaves that field again.
 * - Fields listed in `validators` are re-checked on blur.
 * Attach `onBlur` to the <form>; read errors with `errorFor(name)`.
 */
export function useFormErrors(state: ActionState, validators: Record<string, Validator>) {
  // Blur results belong to one server response; a new response resets them.
  const [local, setLocal] = useState<{ owner: ActionState; map: Record<string, string | null> }>({
    owner: state,
    map: {},
  });
  const map = local.owner === state ? local.map : {};

  const onBlur = useCallback(
    (e: FocusEvent<HTMLFormElement>) => {
      const el = e.target as unknown;
      if (!(el instanceof HTMLInputElement) || !el.name || !el.form) return;
      const validate = validators[el.name];
      if (!validate) return;
      const message = validate(el.value, el.form);
      setLocal((prev) => ({
        owner: state,
        map: { ...(prev.owner === state ? prev.map : {}), [el.name]: message },
      }));
    },
    [state, validators],
  );

  const errorFor = (name: string): string | undefined => {
    if (name in map) return map[name] ?? undefined;
    return state && !state.ok ? state.fieldErrors?.[name] : undefined;
  };

  const valueFor = (name: string, fallback = ""): string =>
    (state && !state.ok ? state.values?.[name] : undefined) ?? fallback;

  return { onBlur, errorFor, valueFor };
}
