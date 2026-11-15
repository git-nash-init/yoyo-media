import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-6 py-16">
      <div className="relative mx-auto max-w-lg text-center animate-fade-in">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-10 font-display text-8xl text-muted sm:text-9xl" aria-hidden>
          404
        </p>
        <h1 className="mt-4 font-display text-3xl text-fg sm:text-4xl">We can&apos;t find that page</h1>
        <p className="mt-3 text-muted">
          The link may be mistyped, or the video may have been moved or removed. Nothing is wrong with your account.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/browse" size="lg">
            Browse the catalogue
          </ButtonLink>
          <ButtonLink href="/" variant="secondary" size="lg">
            Go to home
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
