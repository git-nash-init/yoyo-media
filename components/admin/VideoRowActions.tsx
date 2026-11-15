"use client";

import { ButtonLink } from "@/components/ui";
import { ActionButton } from "@/components/admin/client";
import { deleteVideoAction, setVideoFeaturedAction, setVideoStatusAction } from "@/lib/admin/actions/videos";

export function VideoRowActions({ id, title, published, featured }: { id: string; title: string; published: boolean; featured: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <ButtonLink href={`/admin/videos/${id}`} variant="secondary" size="sm">
        Edit
      </ButtonLink>
      <ActionButton action={setVideoStatusAction.bind(null, id, !published)} variant={published ? "secondary" : "primary"}>
        {published ? "Unpublish" : "Publish"}
      </ActionButton>
      <ActionButton action={setVideoFeaturedAction.bind(null, id, !featured)} variant="ghost">
        {featured ? "Unfeature" : "Feature"}
      </ActionButton>
      <ActionButton
        action={deleteVideoAction.bind(null, id, false)}
        variant="danger"
        confirm={`Delete "${title}" and all its files? This cannot be undone.`}
        confirmLabel="Yes, delete"
        pendingLabel="Deleting…"
      >
        Delete
      </ActionButton>
    </div>
  );
}
