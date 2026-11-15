"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  CloseIcon,
  HomeIcon,
  MenuIcon,
  ModelsIcon,
  SeriesIcon,
  ShieldIcon,
  ShortsIcon,
  SignInIcon,
  SignOutIcon,
  StarIcon,
  SubscriptionsIcon,
  UserIcon,
} from "./icons";
import { useFocusTrap } from "./useFocusTrap";

// ---------- open/closed state ----------

const KEY = "yoyo:sidemenu";
const EVENT = "yoyo:sidemenu-change";
const DESKTOP = "(min-width: 1024px)";

/** The desktop sidebar preference lives in localStorage so it survives navigation and reloads. */
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readPinned() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

type Ctx = { pinned: boolean; drawerOpen: boolean; toggle: () => void; closeDrawer: () => void };
const SideMenuContext = createContext<Ctx | null>(null);

function useSideMenu(): Ctx {
  const ctx = useContext(SideMenuContext);
  if (!ctx) throw new Error("SideMenu components must be rendered inside <SideMenuProvider>");
  return ctx;
}

export function SideMenuProvider({ children }: { children: ReactNode }) {
  const pinned = useSyncExternalStore(subscribe, readPinned, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggle = useCallback(() => {
    if (window.matchMedia(DESKTOP).matches) {
      // Wide screens: a sidebar that stays open beside the content.
      try {
        window.localStorage.setItem(KEY, readPinned() ? "0" : "1");
      } catch {
        // Storage unavailable: fall back to the overlay drawer.
        setDrawerOpen((o) => !o);
        return;
      }
      window.dispatchEvent(new Event(EVENT));
    } else {
      setDrawerOpen((o) => !o);
    }
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Growing the window past the breakpoint dismisses the phone drawer.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const onChange = () => {
      if (mq.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const value = useMemo(() => ({ pinned, drawerOpen, toggle, closeDrawer }), [pinned, drawerOpen, toggle, closeDrawer]);
  return <SideMenuContext.Provider value={value}>{children}</SideMenuContext.Provider>;
}

/** Hamburger button at the left of the header. */
export function MenuButton() {
  const { pinned, drawerOpen, toggle } = useSideMenu();
  return (
    <button
      type="button"
      id="menu-button"
      onClick={toggle}
      aria-label="Menu"
      aria-expanded={pinned || drawerOpen}
      aria-controls="side-menu"
      className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg hover:bg-surface-2"
    >
      <MenuIcon size={22} />
    </button>
  );
}

// ---------- menu content ----------

type Item = { href: string; label: string; Icon: ComponentType<{ size?: number }>; match?: string[] };

const MAIN: Item[] = [
  { href: "/browse", label: "Home", Icon: HomeIcon, match: ["/browse", "/watch", "/channel"] },
  { href: "/models", label: "Models", Icon: ModelsIcon },
  { href: "/shorts", label: "Shorts", Icon: ShortsIcon },
  { href: "/series", label: "Series", Icon: SeriesIcon },
  { href: "/subscriptions", label: "Subscriptions", Icon: SubscriptionsIcon },
];

export type SideMenuUser = { name: string; isAdmin: boolean; isSubscriber: boolean } | null;

const row =
  "flex h-11 w-full items-center gap-4 rounded-xl px-3 text-left text-sm font-medium transition-colors";
const idle = "text-fg/90 hover:bg-surface-2 hover:text-fg";
const on = "bg-surface-2 text-fg";

function MenuItems({
  user,
  signOut,
  onNavigate,
}: {
  user: SideMenuUser;
  signOut: () => Promise<void>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (it: Item) => (it.match ?? [it.href]).some((m) => pathname === m || pathname.startsWith(`${m}/`));

  const link = (it: Item, accent = false) => {
    const active = isActive(it);
    return (
      <li key={it.href}>
        <Link
          href={it.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`${row} ${active ? on : idle} ${accent ? "!text-accent" : ""}`}
        >
          <span className={active ? "text-accent" : ""}>
            <it.Icon size={22} />
          </span>
          {it.label}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Menu" className="flex flex-col gap-3 p-3">
      <ul className="space-y-1">{MAIN.map((it) => link(it))}</ul>
      <hr className="border-line" />
      <ul className="space-y-1">
        {user ? (
          <>
            {link({ href: "/account", label: "Account", Icon: UserIcon })}
            {user.isAdmin ? link({ href: "/admin", label: "Admin", Icon: ShieldIcon }) : null}
            {!user.isSubscriber ? link({ href: "/subscribe", label: "Subscribe", Icon: StarIcon }, true) : null}
            <li>
              <form action={signOut}>
                <button type="submit" className={`${row} ${idle}`}>
                  <SignOutIcon size={22} />
                  Sign out
                </button>
              </form>
            </li>
          </>
        ) : (
          <>
            {link({ href: "/login", label: "Sign in", Icon: SignInIcon })}
            {link({ href: "/register", label: "Subscribe", Icon: StarIcon }, true)}
          </>
        )}
      </ul>
      {user ? <p className="truncate px-3 text-xs text-muted">Signed in as {user.name}</p> : null}
      <hr className="border-line" />
      <div className="px-3 pb-1">
        <p className="mb-2 text-xs font-medium text-muted">Theme</p>
        <ThemeToggle variant="segmented" fullWidth />
      </div>
    </nav>
  );
}

/**
 * The menu itself. Wide screens: a sticky sidebar beside the content while pinned.
 * Narrow screens: a modal drawer with a backdrop and focus trap that closes on
 * Escape, on backdrop tap and when a link is followed.
 */
export function SideMenu({ user, signOut }: { user: SideMenuUser; signOut: () => Promise<void> }) {
  const { pinned, drawerOpen, closeDrawer } = useSideMenu();
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer, "#menu-button");

  return (
    <>
      {pinned ? (
        <aside
          id="side-menu"
          className="sticky top-14 hidden h-[calc(100dvh_-_3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-line bg-bg transition-[top,height] duration-300 ease-out lg:block [:root[data-header-hidden]_&]:top-0 [:root[data-header-hidden]_&]:h-dvh"
        >
          <MenuItems user={user} signOut={signOut} />
        </aside>
      ) : null}

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={closeDrawer} aria-hidden="true" />
          <div
            ref={drawerRef}
            id={pinned ? undefined : "side-menu"}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-bg pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none animate-fade-in"
          >
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2">
              <button
                type="button"
                onClick={closeDrawer}
                data-autofocus
                aria-label="Close menu"
                className="grid h-10 w-10 place-items-center rounded-full text-fg hover:bg-surface-2"
              >
                <CloseIcon size={22} />
              </button>
              <Logo href={null} />
            </div>
            <MenuItems user={user} signOut={signOut} onNavigate={closeDrawer} />
          </div>
        </div>
      ) : null}
    </>
  );
}
