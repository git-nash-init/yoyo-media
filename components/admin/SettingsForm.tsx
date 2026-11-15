"use client";

import { Card, Field } from "@/components/ui";
import { CheckboxField, SelectField, TextareaField } from "@/components/admin/ui";
import { FormStatus, SubmitButton, useAdminForm } from "@/components/admin/client";
import { saveSettingsAction } from "@/lib/admin/actions/misc";

export type SettingsValues = {
  price_rupees: string;
  plan_days: string;
  watermark_enabled: boolean;
  watermark_position: string;
  hero_title: string;
  hero_subtitle: string;
};

export function SettingsForm({ values }: { values: SettingsValues }) {
  const { state, pending, onSubmit, errors } = useAdminForm(saveSettingsAction);
  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
      <Card className="space-y-5 p-5">
        <h2 className="text-base font-medium text-fg">Subscription plan</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Price (₹)" name="price_rupees" inputMode="decimal" required defaultValue={values.price_rupees} error={errors.price_rupees} hint="In rupees, e.g. 999. Applies to new checkouts only." />
          <Field label="Plan length (days)" name="plan_days" type="number" inputMode="numeric" min={1} max={3650} required defaultValue={values.plan_days} error={errors.plan_days} hint="How long one payment gives access." />
        </div>
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="text-base font-medium text-fg">Player watermark</h2>
        <CheckboxField label="Show the logo watermark on the player" name="watermark_enabled" defaultChecked={values.watermark_enabled} hint="A small logo over the video discourages screen recording being passed around." />
        <SelectField label="Position" name="watermark_position" defaultValue={values.watermark_position} error={errors.watermark_position} className="max-w-xs">
          <option value="top-right">Top right</option>
          <option value="top-left">Top left</option>
          <option value="bottom-right">Bottom right</option>
          <option value="bottom-left">Bottom left</option>
        </SelectField>
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="text-base font-medium text-fg">Landing page hero</h2>
        <Field label="Hero title" name="hero_title" required maxLength={120} defaultValue={values.hero_title} error={errors.hero_title} hint="The big headline visitors see first. Up to 120 characters." />
        <TextareaField label="Hero subtitle" name="hero_subtitle" required maxLength={240} rows={3} defaultValue={values.hero_subtitle} error={errors.hero_subtitle} hint="One or two sentences under the headline. Up to 240 characters." />
      </Card>

      <FormStatus state={state} />
      <SubmitButton pending={pending}>Save settings</SubmitButton>
    </form>
  );
}
