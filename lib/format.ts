// Pure helpers, safe to import from client and server components.

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  const units: [number, string][] = [
    [31536000, "yr"],
    [2592000, "mo"],
    [604800, "wk"],
    [86400, "day"],
    [3600, "hr"],
    [60, "min"],
  ];
  for (const [size, label] of units) {
    const n = Math.floor(sec / size);
    if (n >= 1) return `${n} ${label}${n > 1 && label === "day" ? "s" : ""} ago`;
  }
  return "just now";
}

export function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatBytes(bytes: number | bigint): string {
  let n = Number(bytes);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 80) || "item"
  );
}
