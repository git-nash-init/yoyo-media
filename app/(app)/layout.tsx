import { Suspense, type ReactNode } from "react";
import { SessionWatcher } from "@/components/auth/SessionWatcher";
import { Logo } from "@/components/brand/Logo";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { AutoHideHeader } from "@/components/shell/AutoHideHeader";
import { BottomNav, TopNav } from "@/components/shell/Nav";
import { SearchBox } from "@/components/shell/SearchBox";
import { MenuButton, SideMenu, SideMenuProvider } from "@/components/shell/SideMenu";
import { OfflineBanner } from "@/components/states/OfflineBanner";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ButtonLink } from "@/components/ui";
import { logoutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const menuUser = user
    ? { name: user.name, isAdmin: user.role === "ADMIN", isSubscriber: user.isSubscriber }
    : null;

  return (
    <SideMenuProvider>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>

        <AutoHideHeader className="glass-bar sticky top-0 z-40 border-b">
          <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 lg:gap-5 lg:px-6">
            <MenuButton />
            <span className="shrink-0 sm:hidden">
              <Logo href="/browse" withText={false} />
            </span>
            <span className="hidden shrink-0 sm:inline-flex">
              <Logo href="/browse" />
            </span>

            <TopNav />

            <span className="hidden flex-1 md:block" />
            {/* useSearchParams needs a Suspense boundary */}
            <Suspense fallback={<div className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface md:max-w-md" />}>
              <SearchBox />
            </Suspense>

            {/* Phones reach the theme switch from the side menu instead. */}
            <span className="hidden shrink-0 md:block">
              <ThemeToggle />
            </span>

            {user ? (
              <div className="flex shrink-0 items-center gap-2">
                {!user.isSubscriber ? (
                  <ButtonLink href="/subscribe" size="sm" className="hidden sm:inline-flex">
                    Subscribe
                  </ButtonLink>
                ) : null}
                <AccountMenu
                  name={user.name}
                  email={user.email}
                  isAdmin={user.role === "ADMIN"}
                  isSubscriber={user.isSubscriber}
                  signOut={logoutAction}
                />
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                {/* On phones "Sign in" lives in the side menu to leave room for search. */}
                <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                  Sign in
                </ButtonLink>
                <ButtonLink href="/register" size="sm">
                  Subscribe
                </ButtonLink>
              </div>
            )}
          </div>
        </AutoHideHeader>

        <OfflineBanner />
        {user ? <SessionWatcher /> : null}

        <div className="flex flex-1">
          <SideMenu user={menuUser} signOut={logoutAction} />
          <main id="main" className="min-w-0 flex-1 pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
        </div>

        <BottomNav />
      </div>
    </SideMenuProvider>
  );
}
