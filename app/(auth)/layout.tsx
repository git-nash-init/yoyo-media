import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-3 top-3 sm:right-5 sm:top-5">
        <ThemeToggle />
      </div>
      <div className="mb-6">
        <Logo size={36} />
      </div>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl sm:p-8 animate-fade-in">
        {children}
      </div>
      <p className="mt-6 max-w-md text-center text-xs text-muted">
        Original series and shorts from our own creators. One simple plan.
      </p>
    </main>
  );
}
