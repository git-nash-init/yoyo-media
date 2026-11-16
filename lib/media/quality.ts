// Quality choices for the player. Pure (no database, no server-only) so the player, the watch page
// and the tests can all share it.

/** `height` 0 means the main file exactly as stored (no `?q=` in its URL); anything else is a lower copy. */
export type Quality = { height: number; label: string };

/** Label shown in the menu and on the button. */
export const qualityLabel = (height: number) => `${height}p`;

/**
 * Choices for a video, best first. A video without lower copies has nothing to choose, so it gets an
 * empty list and the player hides the selector.
 */
export function buildQualities(mainHeight: number, renditionHeights: number[]): Quality[] {
  const lower = [...new Set(renditionHeights)]
    .filter((h) => Number.isInteger(h) && h > 0 && h !== mainHeight)
    .sort((a, b) => b - a);
  if (lower.length === 0) return [];
  return [
    { height: 0, label: mainHeight > 0 ? qualityLabel(mainHeight) : "Original" },
    ...lower.map((h) => ({ height: h, label: qualityLabel(h) })),
  ];
}

/**
 * Which choice to start with. `preferred` is the height the viewer picked last time (0 = always the best).
 * Falls back to the best available quality that is not above the preference, then to the lowest one.
 */
export function pickQuality(qualities: Quality[], preferred: number): Quality | null {
  if (qualities.length === 0) return null;
  if (preferred <= 0) return qualities[0];
  const value = (q: Quality, mainHeight: number) => (q.height === 0 ? mainHeight : q.height);
  // The main file's real height is unknown here when it is labelled "Original"; treat it as the top choice.
  const mainHeight = Number.parseInt(qualities[0].label, 10) || Number.POSITIVE_INFINITY;
  const fit = qualities.find((q) => value(q, mainHeight) <= preferred);
  return fit ?? qualities[qualities.length - 1];
}

/** The `?q=` value of a stream request: a plain 3 or 4 digit height such as "480", otherwise null (play the main file). */
export function parseQualityParam(raw: string | null): number | null {
  if (!raw || !/^\d{3,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 144 && n <= 2160 ? n : null;
}
