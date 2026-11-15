import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YoYo Videos",
    short_name: "YoYo",
    description: "Original series, shorts and exclusive drops from our own creators. One simple plan.",
    id: "/",
    start_url: "/browse",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0e0e0f",
    theme_color: "#0e0e0f",
    categories: ["entertainment", "video"],
    icons: [
      { src: "/brand/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Browse", url: "/browse" },
      { name: "Shorts", url: "/shorts" },
    ],
  };
}
