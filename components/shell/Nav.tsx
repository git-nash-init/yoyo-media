"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, ModelsIcon, SeriesIcon, ShortsIcon, SubscriptionsIcon } from "./icons";

const LINKS = [
  { href: "/browse", label: "Home", Icon: HomeIcon, match: ["/browse", "/watch", "/channel"] },
  { href: "/shorts", label: "Shorts", Icon: ShortsIcon, match: ["/shorts"] },
  { href: "/series", label: "Series", Icon: SeriesIcon, match: ["/series"] },
  { href: "/models", label: "Models", Icon: ModelsIcon, match: ["/models"] },
  { href: "/subscriptions", label: "Subscriptions", Icon: SubscriptionsIcon, match: ["/subscriptions"] },
] as const;

function isActive(pathname: string, match: readonly string[]) {
  return match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

/** Desktop header links with active highlighting. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {LINKS.map(({ href, label, match }) => {
        const active = isActive(pathname, match);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile fixed bottom navigation with safe-area padding. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="glass-bar fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-14 grid-cols-5">
        {LINKS.map(({ href, label, Icon, match }) => {
          const active = isActive(pathname, match);
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? "text-accent" : "text-muted hover:text-fg"
                }`}
              >
                <Icon size={22} />
                <span className="max-w-full truncate px-0.5">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
