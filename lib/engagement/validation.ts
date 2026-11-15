// Pure comment validation shared by the composer (live feedback) and the Server
// Action (the real check). No prisma / server-only imports, so it is unit-testable.

export const COMMENT_MAX = 500;

export type CommentBodyResult = { ok: true; body: string } | { ok: false; error: string };

/**
 * Clean up a comment before validating/saving: normalise line endings, drop
 * control and zero-width characters, trim, and cap runs of blank lines.
 * The text is stored and rendered as plain text only.
 */
export function normalizeCommentBody(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, "\n")
      // control chars except \n and \t; zero-width space, direction marks and bidi overrides
      // (zero-width joiners are kept: emoji sequences and Indic scripts need them)
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Length as the user perceives it (code points, so an emoji counts once-ish, not as two UTF-16 units). */
export function commentLength(body: string): number {
  return Array.from(body).length;
}

export function validateCommentBody(raw: unknown): CommentBodyResult {
  if (typeof raw !== "string") return { ok: false, error: "Write a comment first." };
  const body = normalizeCommentBody(raw);
  if (!body) return { ok: false, error: "Write a comment first — it can't be empty." };
  const len = commentLength(body);
  if (len > COMMENT_MAX)
    return { ok: false, error: `That is ${len - COMMENT_MAX} characters too long. Keep it to ${COMMENT_MAX} or fewer.` };
  return { ok: true, body };
}
