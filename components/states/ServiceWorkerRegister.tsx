"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (public/sw.js) in production.
 * In development any previously registered worker is removed (and its caches
 * cleared) so stale assets never mask code changes. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(async () => {
          if (!("caches" in window)) return;
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith("yoyo-")).map((k) => caches.delete(k)));
        })
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Offline support is an enhancement; the site works without it.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

export default ServiceWorkerRegister;
