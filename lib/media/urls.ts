// URL builders for media served by app/api/media/[kind]/[id]/route.ts.
// Safe to import from client and server components.

type WithVersion = { id: string; updatedAt?: Date | string };
const v = (x: WithVersion) => (x.updatedAt ? `?v=${new Date(x.updatedAt).getTime()}` : "");

/** Public. Falls back to a placeholder image when the video has no thumbnail. */
export const thumbUrl = (video: WithVersion & { thumbPath?: string | null }) =>
  video.thumbPath ? `/api/media/thumb/${video.id}${v(video)}` : "/brand/placeholder-thumb.svg";

/** Public 8-second muted preview clip, or null when none exists. */
export const previewUrl = (video: { id: string; previewPath?: string | null }) =>
  video.previewPath ? `/api/media/preview/${video.id}` : null;

/** Subscriber-only full video stream (supports Range). `height` picks a lower quality when the video has one. */
export const videoUrl = (videoId: string, height?: number) =>
  height ? `/api/media/video/${videoId}?q=${height}` : `/api/media/video/${videoId}`;

/** Subscriber-only download (same file, sent as an attachment). */
export const downloadUrl = (videoId: string) => `/api/media/video/${videoId}?download=1`;

export const channelLogoUrl = (c: { id: string; logoPath?: string | null }) =>
  c.logoPath ? `/api/media/channel/${c.id}` : "/brand/placeholder-avatar.svg";

export const modelPhotoUrl = (m: { id: string; photoPath?: string | null }) =>
  m.photoPath ? `/api/media/model/${m.id}` : "/brand/placeholder-avatar.svg";

export const seriesPosterUrl = (s: { id: string; posterPath?: string | null }) =>
  s.posterPath ? `/api/media/series/${s.id}` : "/brand/placeholder-thumb.svg";

/** Admin-only: one of a video's candidate thumbnails by index. */
export const thumbCandidateUrl = (videoId: string, index: number) =>
  `/api/media/candidate/${videoId}?i=${index}`;
