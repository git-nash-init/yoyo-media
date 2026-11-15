import type { ReactNode } from "react";

/**
 * One line-icon set (24px grid, 1.5 stroke, currentColor) for state screens.
 * Call sites pass a short name; the old emoji values still work and map to the same icons.
 */
const PATHS: Record<string, ReactNode> = {
  film: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 5.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.3 3.5 5.2" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5h6v3H9zM8.5 12h7M8.5 16h5" />
    </>
  ),
  message: <path d="M4 5.5h16v11H10l-4.5 3.5v-3.5H4z" />,
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l9 15.5H3z" />
      <path d="M12 10v4M12 17v.01" />
    </>
  ),
};

const EMOJI_TO_NAME: Record<string, string> = {
  "🎬": "film",
  "🔒": "lock",
  "💗": "heart",
  "🔎": "search",
  "📱": "phone",
  "👥": "users",
  "📋": "clipboard",
  "💬": "message",
  "💳": "card",
  "⚠️": "alert",
  "⚠": "alert",
};

export function LineIcon({ name, size = 24 }: { name: string; size?: number }) {
  const key = PATHS[name] ? name : (EMOJI_TO_NAME[name] ?? "film");
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[key]}
    </svg>
  );
}

/** Strings become line icons; anything else (an element) is rendered as given. */
export function renderIcon(icon: ReactNode, size = 24): ReactNode {
  return typeof icon === "string" ? <LineIcon name={icon} size={size} /> : icon;
}
