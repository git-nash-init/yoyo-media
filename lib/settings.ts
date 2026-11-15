import "server-only";
import { prisma } from "@/lib/db";

export const SETTING_DEFAULTS = {
  price_paise: "99900",
  plan_days: "30",
  watermark_enabled: "true",
  watermark_position: "top-right", // top-right | top-left | bottom-right | bottom-left
  hero_title: "Originals you will not find anywhere else",
  hero_subtitle: "Series, shorts and exclusive drops from our own creators. One simple plan.",
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in SETTING_DEFAULTS) out[r.key] = r.value;
  return out as Record<SettingKey, string>;
}

export async function setSetting(key: SettingKey, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Current subscription plan: price in paise (99900 = ₹999) and length in days. */
export async function getPlan(): Promise<{ pricePaise: number; days: number }> {
  const s = await getSettings();
  return { pricePaise: Number(s.price_paise) || 99900, days: Number(s.plan_days) || 30 };
}
