import type { WatermarkConfig, WatermarkPosition } from "@/lib/queries/types";

const corner: Record<WatermarkPosition, string> = {
  "top-right": "top-3 right-3 sm:top-4 sm:right-4",
  "top-left": "top-3 left-3 sm:top-4 sm:left-4",
  "bottom-right": "bottom-16 right-3 sm:right-4",
  "bottom-left": "bottom-16 left-3 sm:left-4",
};

const POSITIONS: readonly string[] = ["top-right", "top-left", "bottom-right", "bottom-left"];

/** Turn the raw settings strings into a safe watermark config (unknown values fall back to top-right). */
export function watermarkFromSettings(s: { watermark_enabled: string; watermark_position: string }): WatermarkConfig {
  return {
    enabled: s.watermark_enabled !== "false",
    position: (POSITIONS.includes(s.watermark_position) ? s.watermark_position : "top-right") as WatermarkPosition,
  };
}

/**
 * Brand watermark overlaid on every player. It lives inside the player WRAPPER
 * (the element that goes fullscreen), so it stays visible in fullscreen too.
 */
export function Watermark({ config, compact = false }: { config: WatermarkConfig; compact?: boolean }) {
  if (!config.enabled) return null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-20 flex select-none items-center gap-1.5 rounded-full bg-black/45 py-1 pl-1 pr-2.5 backdrop-blur-sm ${corner[config.position]}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/icon.svg" alt="" width={compact ? 18 : 22} height={compact ? 18 : 22} draggable={false} />
      <span className={`font-medium text-white/90 ${compact ? "text-[11px]" : "text-xs sm:text-sm"}`}>
        YoYo <span className="text-accent">Videos</span>
      </span>
    </div>
  );
}
