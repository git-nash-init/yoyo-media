"use client";

import { useState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { CheckboxField, SelectField, TextareaField } from "@/components/admin/ui";
import { FormStatus, SubmitButton, useAdminForm } from "@/components/admin/client";
import { updateVideoAction } from "@/lib/admin/actions/videos";
import { normalizeSlug } from "@/lib/admin/logic";

export type VideoFormValues = {
  id: string;
  title: string;
  slug: string;
  description: string;
  type: "LONG" | "SHORT";
  status: "DRAFT" | "PUBLISHED";
  channelId: string;
  seriesId: string;
  episodeNo: string;
  isFeatured: boolean;
  modelIds: string[];
};

type Option = { id: string; name: string };

export function VideoEditForm({
  video,
  channels,
  series,
  models,
}: {
  video: VideoFormValues;
  channels: Option[];
  series: Option[];
  models: Option[];
}) {
  const { state, pending, onSubmit, errors } = useAdminForm(updateVideoAction.bind(null, video.id));
  const [title, setTitle] = useState(video.title);
  const [slug, setSlug] = useState(video.slug);
  // Keep the slug following the title until the admin edits the slug by hand.
  const [slugAuto, setSlugAuto] = useState(video.slug === normalizeSlug(video.title) && video.status === "DRAFT");
  const [seriesId, setSeriesId] = useState(video.seriesId);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Card className="space-y-5 p-5">
        <Field
          label="Title"
          name="title"
          required
          maxLength={150}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (slugAuto) setSlug(normalizeSlug(e.target.value));
          }}
          error={errors.title}
        />
        <div>
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
            hint="Used in the web address of the video. Lowercase letters, numbers and hyphens."
            autoCapitalize="none"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1.5 -ml-2"
            onClick={() => {
              setSlug(normalizeSlug(title));
              setSlugAuto(true);
            }}
          >
            Regenerate from title
          </Button>
        </div>
        <TextareaField label="Description" name="description" defaultValue={video.description} maxLength={5000} rows={5} error={errors.description} hint="Shown under the player. Optional." />
      </Card>

      <Card className="grid gap-5 p-5 sm:grid-cols-2">
        <SelectField label="Type" name="type" defaultValue={video.type} error={errors.type} hint="Shorts are vertical clips of 90 seconds or less.">
          <option value="LONG">Video</option>
          <option value="SHORT">Short</option>
        </SelectField>
        <SelectField label="Channel" name="channelId" defaultValue={video.channelId} error={errors.channelId}>
          <option value="">No channel</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Series" name="seriesId" value={seriesId} onChange={(e) => setSeriesId(e.target.value)} error={errors.seriesId}>
          <option value="">Not part of a series</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <Field
          label="Episode number"
          name="episodeNo"
          type="number"
          inputMode="numeric"
          min={1}
          max={9999}
          defaultValue={video.episodeNo}
          disabled={!seriesId}
          error={errors.episodeNo}
          hint={seriesId ? "Orders the episodes inside the series." : "Pick a series to set an episode number."}
        />
      </Card>

      <Card className="p-5">
        <fieldset aria-describedby={errors.modelIds ? "models-err" : undefined}>
          <legend className="text-sm font-medium text-fg">Models in this video</legend>
          {models.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No models yet. Add them under Models, then come back to tag this video.</p>
          ) : (
            <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-sm text-fg has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="checkbox" name="modelIds" value={m.id} defaultChecked={video.modelIds.includes(m.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
                  <span className="truncate">{m.name}</span>
                </label>
              ))}
            </div>
          )}
          {errors.modelIds ? (
            <p id="models-err" role="alert" className="mt-2 text-sm text-danger">
              {errors.modelIds}
            </p>
          ) : null}
        </fieldset>
      </Card>

      <Card className="space-y-5 p-5">
        <SelectField
          label="Status"
          name="status"
          defaultValue={video.status}
          error={errors.status}
          hint="Published videos are visible to subscribers straight away. The publish date is set the first time you publish."
          className="max-w-xs"
        >
          <option value="DRAFT">Draft (hidden)</option>
          <option value="PUBLISHED">Published (live)</option>
        </SelectField>
        <CheckboxField label="Feature on the landing page" name="isFeatured" defaultChecked={video.isFeatured} hint="Featured videos appear in the carousel on the public landing page." />
      </Card>

      <FormStatus state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>Save changes</SubmitButton>
      </div>
    </form>
  );
}
