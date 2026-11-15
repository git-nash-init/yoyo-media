"use client";

import { useEffect } from "react";

// Replaces the root layout when it fails, so it renders its own document and
// uses inline styles only (global CSS and fonts may not be available here).

function digestOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const d = (error as { digest?: unknown }).digest;
    if (typeof d === "string" && d.length > 0) return d.slice(0, 64);
  }
  return null;
}

const pill = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 44,
  padding: "0 24px",
  borderRadius: 999,
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "inherit",
  textDecoration: "none",
  cursor: "pointer",
} as const;

export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = digestOf(error);
  const tryAgain = retry ?? reset;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0e0e0f",
          color: "#ececea",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <title>Something went wrong · YoYo Videos</title>
        <main style={{ maxWidth: 440 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon.svg" alt="" width={48} height={48} style={{ marginBottom: 20 }} />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.6 }}>YoYo Videos couldn&apos;t load.</p>
          <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.6, color: "#9b9a96" }}>
            This is a problem on our side, not something you did. Try again in a moment.
          </p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => (tryAgain ? tryAgain() : window.location.reload())}
              style={{ ...pill, border: "none", background: "#d63a1a", color: "#fff" }}
            >
              Try again
            </button>
            {/* A full page load on purpose: the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ ...pill, border: "1px solid #2a2a2c", background: "#1c1c1e", color: "#ececea" }}>
              Go to home
            </a>
          </div>
          {digest ? (
            <p style={{ marginTop: 24, fontSize: 12, color: "#9b9a96" }}>
              Reference code: <code style={{ color: "#ececea" }}>{digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
