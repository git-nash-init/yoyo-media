// Theme preference shared by server and client. Not sensitive, so a readable cookie is fine.
export const THEME_COOKIE = "yoyo_theme";
export type ThemePref = "system" | "light" | "dark";

export function parseThemePref(value: string | undefined | null): ThemePref {
  return value === "light" || value === "dark" ? value : "system";
}
