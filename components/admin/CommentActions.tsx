"use client";

import { ActionButton } from "@/components/admin/client";
import { deleteCommentAction, deleteUserCommentsAction, restoreCommentAction } from "@/lib/admin/actions/comments";

export function CommentActions({
  id,
  deleted,
  userId,
  authorName,
  showDeleteAll = true,
}: {
  id: string;
  deleted: boolean;
  userId: string;
  authorName: string;
  showDeleteAll?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      {deleted ? (
        <ActionButton action={restoreCommentAction.bind(null, id)} pendingLabel="Restoring…">
          Restore
        </ActionButton>
      ) : (
        <ActionButton
          action={deleteCommentAction.bind(null, id)}
          variant="danger"
          confirm="Delete this comment? Viewers stop seeing it; you can restore it later."
          confirmLabel="Yes, delete"
          pendingLabel="Deleting…"
        >
          Delete
        </ActionButton>
      )}
      {showDeleteAll ? <DeleteAllByUserButton userId={userId} authorName={authorName} size="sm" /> : null}
    </div>
  );
}

export function DeleteAllByUserButton({ userId, authorName, size = "md" }: { userId: string; authorName: string; size?: "sm" | "md" }) {
  return (
    <ActionButton
      action={deleteUserCommentsAction.bind(null, userId)}
      variant="ghost"
      size={size}
      confirm={`Delete ALL visible comments by ${authorName}, on every video? Each one can be restored individually afterwards.`}
      confirmLabel="Yes, delete all"
      pendingLabel="Deleting…"
    >
      Delete all by user
    </ActionButton>
  );
}
