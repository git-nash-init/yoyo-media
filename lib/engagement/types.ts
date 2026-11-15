// Serialisable engagement shapes for client components. Never includes emails.

export type CommentItem = {
  id: string;
  body: string;
  authorName: string;
  /** Pre-formatted on the server ("3 min ago"). */
  ago: string;
  /** Whether the current viewer may delete it (own comment, or admin). Re-checked on the server. */
  canDelete: boolean;
};

export type EngagementSummary = { likeCount: number; commentCount: number; liked: boolean };

/** What the current viewer is allowed to do; decides which prompts the UI shows. The server re-checks everything. */
export type Viewer = { signedIn: boolean; isSubscriber: boolean };

export type LikeResult = { ok: true; liked: boolean; likeCount: number } | { ok: false; error: string; gate?: "login" | "subscribe" };

export type CommentsPageResult =
  | { ok: true; items: CommentItem[]; nextCursor: string | null; total: number }
  | { ok: false; error: string };

export type AddCommentResult =
  | { ok: true; comment: CommentItem; total: number }
  | { ok: false; error: string; gate?: "login" | "subscribe" };

export type DeleteCommentResult = { ok: true; total: number } | { ok: false; error: string };
