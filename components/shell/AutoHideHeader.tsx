"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { useHideOnScroll } from "./useHideOnScroll";

/**
 * The signed-in app header. It slides away while you scroll down and returns when you scroll up.
 * While hidden it sets `data-header-hidden` on <html> so the sticky side menu can move up too.
 */
export function AutoHideHeader({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { hidden, reveal } = useHideOnScroll(ref);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-header-hidden", hidden);
    return () => document.documentElement.removeAttribute("data-header-hidden");
  }, [hidden]);

  return (
    <header
      ref={ref}
      onFocusCapture={reveal}
      className={cn(className, "transition-transform duration-300 ease-out", hidden && "-translate-y-full")}
    >
      {children}
    </header>
  );
}
