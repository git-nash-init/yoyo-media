import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { RetryButton } from "@/components/marketing/RetryButton";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

const WORKS = [
  "Pages you have already opened on this device",
  "Thumbnails and artwork you have already seen",
  "Videos you downloaded to your device (open them from your downloads)",
];
const NEEDS = ["Playing or downloading videos", "Signing in or creating an account", "Subscribing and payments"];

function List({ items, ok }: { items: string[]; ok: boolean }) {
  return (
    <ul className="mt-3 space-y-2.5 text-sm text-fg/90">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <svg
            viewBox="0 0 20 20"
            className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-success" : "text-muted"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {ok ? <path d="M4 10.5l4 4 8-9" /> : <path d="M5 5l10 10M15 5L5 15" />}
          </svg>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Shown by the service worker when a page is requested with no connection and no saved copy. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-16">
      <div className="mx-auto w-full max-w-xl text-center animate-fade-in">
        <div className="flex justify-center">
          <Logo href={null} />
        </div>
        <div className="mx-auto mt-10 grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-warning" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8a15 15 0 0 0-8.3-3.7M5 12.9a10 10 0 0 1 3.3-2.1M19 12.9a10 10 0 0 0-3.6-2.2M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-4xl text-fg">You&apos;re offline</h1>
        <p className="mt-3 text-muted">
          This looks like a connection problem, not a fault with YoYo Videos or your account. Check your Wi-Fi or mobile data, then try
          again.
        </p>

        <div className="mt-8 flex justify-center">
          <RetryButton />
        </div>

        <div className="mt-10 grid gap-4 text-left sm:grid-cols-2">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-medium text-fg">Still works offline</h2>
            <List items={WORKS} ok />
          </section>
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-medium text-fg">Needs a connection</h2>
            <List items={NEEDS} ok={false} />
          </section>
        </div>
      </div>
    </main>
  );
}
