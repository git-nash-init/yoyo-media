import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { ServiceWorkerRegister } from "@/components/states/ServiceWorkerRegister";
import { SlowLoadNotice } from "@/components/states/SlowLoadNotice";
import { THEME_COOKIE, parseThemePref } from "@/lib/theme";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Display face for headlines: one regular weight, hierarchy comes from size.
const displaySerif = Instrument_Serif({ variable: "--font-display-serif", subsets: ["latin"], weight: "400" });

// Every page is rendered per request so the CSP nonce from proxy.ts applies to its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "YoYo Videos — Original series and shorts", template: "%s · YoYo Videos" },
  description:
    "YoYo Videos is a subscription streaming platform for original series, shorts and exclusive drops from our own creators.",
  applicationName: "YoYo Videos",
  icons: {
    icon: [
      { url: "/brand/icon.svg", type: "image/svg+xml" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "YoYo Videos",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "YoYo Videos" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og-image.png"] },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Theme comes from a cookie and is applied on the server, so there is no flash and no inline script.
  const pref = parseThemePref((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={pref === "system" ? undefined : pref}
      className={`${geistSans.variable} ${geistMono.variable} ${displaySerif.variable}`}
    >
      <body>
        {children}
        <ServiceWorkerRegister />
        <SlowLoadNotice />
      </body>
    </html>
  );
}
