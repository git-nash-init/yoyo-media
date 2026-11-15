"use client";

import { useSyncExternalStore } from "react";
import { THEME_COOKIE, parseThemePref, type ThemePref } from "@/lib/theme";
import { cn } from "@/components/ui";

function readPref(): ThemePref {
  if (typeof document === "undefined") return "system";
  return parseThemePref(document.documentElement.dataset.theme);
}

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

function applyPref(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax${secure}`;
}

const ORDER: ThemePref[] = ["system", "light", "dark"];
const LABEL: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };

function Icon({ pref, size = 18 }: { pref: ThemePref; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (pref === "light")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (pref === "dark")
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

// The visible state is driven by CSS from <html data-theme> (set on the server from
// the cookie), so the right option shows before hydration with no "System" flash.
const ACTIVE: Record<ThemePref, string> = {
  system:
    "[:root:not([data-theme])_&]:bg-surface [:root:not([data-theme])_&]:text-fg [:root:not([data-theme])_&]:shadow-sm",
  light:
    "[:root[data-theme=light]_&]:bg-surface [:root[data-theme=light]_&]:text-fg [:root[data-theme=light]_&]:shadow-sm",
  dark: "[:root[data-theme=dark]_&]:bg-surface [:root[data-theme=dark]_&]:text-fg [:root[data-theme=dark]_&]:shadow-sm",
};
const SHOW: Record<ThemePref, string> = {
  system: "hidden [:root:not([data-theme])_&]:block",
  light: "hidden [:root[data-theme=light]_&]:block",
  dark: "hidden [:root[data-theme=dark]_&]:block",
};

/**
 * Theme switcher.
 * - `variant="icon"` (default): one round button that cycles System → Light → Dark. For headers.
 * - `variant="segmented"`: three labelled options. For menus, settings and the account page.
 */
export function ThemeToggle({
  variant = "icon",
  fullWidth = false,
  className,
}: {
  variant?: "icon" | "segmented";
  /** Segmented only: stretch to the container with three equal columns (sidebars, menus). */
  fullWidth?: boolean;
  className?: string;
}) {
  // Read the choice straight from <html data-theme> so every toggle on the page
  // (header icon, menus, account card) stays in sync.
  const pref = useSyncExternalStore(subscribeTheme, readPref, () => "system" as ThemePref);

  const choose = (p: ThemePref) => applyPref(p);

  if (variant === "segmented") {
    return (
      <div
        role="radiogroup"
        aria-label="Theme"
        className={cn(
          "rounded-lg border border-line bg-surface-2 p-1",
          fullWidth ? "grid w-full grid-cols-3 gap-0.5" : "inline-flex",
          className,
        )}
      >
        {ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pref === p}
            onClick={() => choose(p)}
            className={cn(
              "inline-flex h-8 min-w-0 items-center gap-1.5 whitespace-nowrap rounded text-xs font-medium text-muted transition-colors hover:text-fg",
              fullWidth ? "justify-center px-1.5" : "px-3",
              ACTIVE[p],
            )}
          >
            <Icon pref={p} size={14} />
            {LABEL[p]}
          </button>
        ))}
      </div>
    );
  }

  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  return (
    <button
      type="button"
      onClick={() => choose(next)}
      aria-label={`Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[pref]}`}
      className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg text-fg hover:bg-surface-2", className)}
    >
      {ORDER.map((p) => (
        <span key={p} className={SHOW[p]}>
          <Icon pref={p} />
        </span>
      ))}
    </button>
  );
}
