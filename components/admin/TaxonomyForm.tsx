"use client";

import { useState } from "react";
import { ButtonLink, Card, Field, cn } from "@/components/ui";
import { CheckboxField, SelectField, TextareaField, Thumb } from "@/components/admin/ui";
import { FormStatus, SubmitButton, useAdminForm } from "@/components/admin/client";
import { saveTaxonomyAction } from "@/lib/admin/actions/taxonomy";
import { normalizeSlug } from "@/lib/admin/logic";

export type TaxonomyKind = "channel" | "model" | "series";

const COPY: Record<TaxonomyKind, { name: string; description: string; image: string; imageHint: string; listHref: string; create: string }> = {
  channel: { name: "Name", description: "Description", image: "Logo", imageHint: "Square image works best.", listHref: "/admin/channels", create: "Create channel" },
  model: { name: "Name", description: "Bio", image: "Photo", imageHint: "Square portrait works best.", listHref: "/admin/models", create: "Add model" },
  series: { name: "Title", description: "Description", image: "Poster", imageHint: "16:9 poster works best.", listHref: "/admin/series", create: "Create series" },
};

export function TaxonomyForm({
  kind,
  item,
  imageUrl,
  channels = [],
}: {
  kind: TaxonomyKind;
  /** Existing row when editing; omit to create. */
  item?: { id: string; name: string; slug: string; description: string; sortOrder: number; channelId: string; hasImage: boolean };
  imageUrl?: string;
  channels?: { id: string; name: string }[];
}) {
  const copy = COPY[kind];
  const { state, pending, onSubmit, errors } = useAdminForm(saveTaxonomyAction.bind(null, kind, item?.id ?? null));
  const [name, setName] = useState(item?.name ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  const [slugAuto, setSlugAuto] = useState(!item);
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
      <Card className="space-y-5 p-5">
        <Field
          label={copy.name}
          name="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (slugAuto) setSlug(normalizeSlug(e.target.value));
          }}
          error={errors.name}
        />
        <Field
          label="Slug"
          name="slug"
          maxLength={80}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugAuto(false);
          }}
          onBlur={() => slug.trim() && setSlug(normalizeSlug(slug))}
          error={errors.slug}
          hint="Used in the web address. Lowercase letters, numbers and hyphens. Leave empty to generate it from the name."
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextareaField label={copy.description} name="description" defaultValue={item?.description ?? ""} maxLength={2000} error={errors.description} hint="Optional." />
        {kind === "channel" ? (
          <Field
            label="Sort order"
            name="sortOrder"
            type="number"
            inputMode="numeric"
            defaultValue={item?.sortOrder ?? 0}
            min={-9999}
            max={9999}
            error={errors.sortOrder}
            hint="Lower numbers are listed first."
            className="max-w-[12rem]"
          />
        ) : null}
        {kind === "series" ? (
          <SelectField label="Channel" name="channelId" defaultValue={item?.channelId ?? ""} error={errors.channelId} hint="Optional. Groups this series under one of your channels.">
            <option value="">No channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start gap-4">
          {item?.hasImage && imageUrl ? (
            <Thumb src={imageUrl} alt={`Current ${copy.image.toLowerCase()}`} className={cn("border border-line", kind === "series" ? "aspect-video w-40 rounded-xl" : "h-20 w-20 rounded-full")} />
          ) : null}
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="f-image" className="block text-sm font-medium text-fg">
              {copy.image}
            </label>
            <input
              id="f-image"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-invalid={errors.image || fileError ? true : undefined}
              aria-describedby="f-image-help"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFileError(f && f.size > 5 * 1024 * 1024 ? "Image must be 5 MB or smaller. Resize it and pick it again." : null);
              }}
              className="block w-full text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-4 file:text-sm file:font-medium file:text-fg"
            />
            {errors.image || fileError ? (
              <p id="f-image-help" role="alert" className="text-sm text-danger">
                {fileError ?? errors.image}
              </p>
            ) : (
              <p id="f-image-help" className="text-sm text-muted">
                JPG, PNG or WebP, up to 5 MB. {copy.imageHint} {item?.hasImage ? "Choosing a file replaces the current one." : "Optional."}
              </p>
            )}
          </div>
        </div>
        {item?.hasImage ? <CheckboxField label={`Remove current ${copy.image.toLowerCase()}`} name="removeImage" /> : null}
      </Card>

      <FormStatus state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending || Boolean(fileError)} pendingLabel={pending ? "Saving…" : item ? "Save changes" : copy.create}>
          {item ? "Save changes" : copy.create}
        </SubmitButton>
        <ButtonLink href={copy.listHref} variant="ghost">
          {item ? "Back to list" : "Cancel"}
        </ButtonLink>
      </div>
    </form>
  );
}
