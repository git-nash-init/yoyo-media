"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour for drawers and sheets: while `active`, focus moves into the
 * container, Tab cycles inside it, Escape calls `onClose`, and focus returns to
 * whatever was focused before when it closes.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
  /** CSS selector to focus on close when nothing usable was focused before opening (e.g. the opener button). */
  returnFocusTo?: string,
) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);

    (el.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? el).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !el.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !el.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Wait for the container to unmount, then restore focus to the opener.
      requestAnimationFrame(() => {
        const fallback = returnFocusTo ? document.querySelector<HTMLElement>(returnFocusTo) : null;
        const target = previous && previous.isConnected && previous !== document.body ? previous : fallback;
        target?.focus();
      });
    };
    // onClose is intentionally not a dependency: callers pass inline functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ref, returnFocusTo]);
}
