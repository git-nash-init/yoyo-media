import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { getSettings } from "@/lib/settings";
import { paiseToRupeesInput } from "@/lib/admin/logic";
import { PageHeader } from "@/components/admin/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { Card } from "@/components/ui";
import { SectionTitle } from "@/components/admin/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" description="Plan price, player watermark and the text on the public landing page." />
      <SettingsForm
        values={{
          price_rupees: paiseToRupeesInput(s.price_paise),
          plan_days: s.plan_days,
          watermark_enabled: s.watermark_enabled === "true",
          watermark_position: s.watermark_position,
          hero_title: s.hero_title,
          hero_subtitle: s.hero_subtitle,
        }}
      />
      <Card className="mt-6 max-w-2xl p-5">
        <SectionTitle>Appearance</SectionTitle>
        <p className="mb-4 text-sm text-muted">Light or dark theme for this browser. System follows your device setting.</p>
        <ThemeToggle variant="segmented" />
      </Card>
    </>
  );
}
