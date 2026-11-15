"use client";

import { useEffect, useState, type RefObject } from "react";

const MIN_MOVE = 10; // ignore jitter smaller than this many pixels
const ALWAYS_SHOW_ABOVE = 72; // near the top of the page the bar is always visible

/**
 * Scrolling down hides a bar, scrolling up brings it back. It stays visible near the top of the
 * page, and while keyboard focus is inside it (so tabbing never lands on an invisible control).
 */
export function useHideOnScroll(ref: RefObject<HTMLElement | null>) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;

    const update = () => {
      // Clamp so the elastic over-scroll on phones does not look like scrolling up or down.
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.min(Math.max(0, window.scrollY), max);
      if (y < ALWAYS_SHOW_ABOVE) {
        setHidden(false);
        last = y;
        return;
      }
      const delta = y - last;
      if (Math.abs(delta) < MIN_MOVE) return;
      if (delta > 0) {
        if (!ref.current?.contains(document.activeElement)) setHidden(true);
      } else {
        setHidden(false);
      }
      last = y;
    };

    // setState with an unchanged value is a no-op, so running on every scroll event is cheap.
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [ref]);

  return { hidden, reveal: () => setHidden(false) };
}
