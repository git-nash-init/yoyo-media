"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/components/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const ITEMS: { href: string; label: string; icon: string }[] = [
  { href: "/admin", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/admin/videos", label: "Videos", icon: "M3 6h13v12H3zM16 10l5-3v10l-5-3" },
  { href: "/admin/shorts", label: "Shorts", icon: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM10.5 9v6l4.5-3z" },
  { href: "/admin/series", label: "Series", icon: "M4 5h16M4 10h16M4 15h10M4 20h10" },
  { href: "/admin/channels", label: "Channels", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { href: "/admin/models", label: "Models", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.5-6 8-6s8 2 8 6" },
  { href: "/admin/comments", label: "Comments", icon: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5" },
  { href: "/admin/subscribers", label: "Subscribers", icon: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M17 4.5a3.5 3.5 0 010 6.5M19 15c2 .7 3 2.3 3 5" },
  { href: "/admin/payments", label: "Payments", icon: "M3 6h18v12H3zM3 10h18M7 15h4" },
  { href: "/admin/ingest", label: "Ingest tokens", icon: "M15 7a4 4 0 11-3.9 5H8v3H5v3H2v-3l6.1-6.1A4 4 0 0115 7zM16 9h.01" },
  { href: "/admin/settings", label: "Settings", icon: "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2M16 4v4M8 10v4M16 16v4" },
  { href: "/admin/audit", label: "Audit log", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d={d} />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-brand-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon d={item.icon} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Footer({ adminName }: { adminName: string }) {
  return (
    <div className="border-t border-line p-3">
      <div className="mb-3 px-3">
        <p className="mb-1.5 text-xs text-muted">Appearance</p>
        <ThemeToggle variant="segmented" fullWidth />
      </div>
      <p className="truncate px-3 text-xs text-muted">Signed in as</p>
      <p className="truncate px-3 text-sm font-medium text-fg">{adminName}</p>
      <Link href="/browse" className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg">
        <Icon d="M10 6l-6 6 6 6M4 12h16" />
        Back to site
      </Link>
    </div>
  );
}

/** Admin navigation: fixed sidebar on desktop, top bar with a slide-in drawer on mobile. */
export function AdminNav({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = ITEMS.find((i) => isActive(pathname, i.href))?.label ?? "Admin";

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <Logo href="/admin" size={28} />
          <span className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-[10px] font-medium text-muted">Admin</span>
        </div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-3">
          <NavLinks pathname={pathname} />
        </nav>
        <Footer adminName={adminName} />
      </aside>

      {/* Mobile top bar */}
      <div className="glass-bar sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={open}
          aria-controls="admin-drawer"
          className="grid h-10 w-10 place-items-center rounded-xl text-fg hover:bg-surface-2"
        >
          <Icon d="M4 7h16M4 12h16M4 17h16" />
        </button>
        <Logo href="/admin" size={24} withText={false} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{current}</span>
        <ThemeToggle />
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close admin menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div id="admin-drawer" role="dialog" aria-modal="true" aria-label="Admin menu" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface animate-fade-in">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo href="/admin" size={26} />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close admin menu" className="grid h-10 w-10 place-items-center rounded-xl text-fg hover:bg-surface-2" autoFocus>
                <Icon d="M6 6l12 12M18 6L6 18" />
              </button>
            </div>
            <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-3">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
            <Footer adminName={adminName} />
          </div>
        </div>
      ) : null}
    </>
  );
}
