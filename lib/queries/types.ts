// Plain serialisable shapes handed to components. Media is already resolved to URLs:
// storage paths (filePath, thumbPath …) and BigInt sizes never leave the query layer.

export type ChannelRef = { id: string; slug: string; name: string; logo: string };

export type VideoCardData = {
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  /** Pre-formatted "3 days ago" (computed on the server to avoid hydration drift). */
  ago: string | null;
  thumb: string;
  preview: string | null;
  episodeNo: number | null;
  channel: ChannelRef | null;
  /** 0–100 when shown in "Continue watching". */
  progressPct?: number;
};

/** Who a short "belongs to" for the follow button: its channel, else its first model. */
export type ShortOwner = {
  kind: "channel" | "model";
  id: string;
  name: string;
  href: string;
  avatar: string;
  following: boolean;
};

export type ShortItem = {
  id: string;
  slug: string;
  title: string;
  thumb: string;
  owner: ShortOwner | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
};

export type ChannelTile = ChannelRef & { videoCount: number };
export type ModelTile = { id: string; slug: string; name: string; photo: string; videoCount: number };
export type SeriesTile = {
  id: string;
  slug: string;
  title: string;
  poster: string;
  episodeCount: number;
  channelName: string | null;
};

export type WatermarkPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";
export type WatermarkConfig = { enabled: boolean; position: WatermarkPosition };
