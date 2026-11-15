"use client";

import { useState } from "react";
import { Burst } from "@/components/effects";
import { CheckIcon, HeartIcon, ShareIcon } from "@/components/shell/icons";
import { buttonClass } from "@/components/ui";
import type { EngagementSummary, Viewer } from "@/lib/engagement/types";
import { CommentsPanel } from "./CommentsPanel";
import { ShareButton } from "./ShareButton";
import { formatCount, useLike } from "./useLike";

/** Like + Share pills for the watch page action row. */
export function WatchActions({
  videoId,
  title,
  path,
  initial,
  viewer,
}: {
  videoId: string;
  title: string;
  path: string;
  initial: EngagementSummary;
  viewer: Viewer;
}) {
  const like = useLike({ videoId, initialLiked: initial.liked, initialCount: initial.likeCount, viewer, returnTo: path });
  return (
    <>
      <span className="inline-flex flex-col">
        <button
          type="button"
          onClick={like.toggle}
          aria-pressed={like.liked}
          aria-label={`${like.liked ? "Unlike" : "Like"} this video. ${like.count} ${like.count === 1 ? "like" : "likes"}`}
          className={buttonClass("secondary", "md", like.liked ? "!border-brand/60 !text-accent" : "")}
        >
          <span key={like.liked ? like.burst : 0} className={`relative grid place-items-center ${like.liked ? "fx-pop" : ""}`}>
            <HeartIcon size={18} filled={like.liked} />
            <Burst trigger={like.liked ? like.burst : 0} kind="hearts" radius={34} />
          </span>
          <span className="tabular-nums">{formatCount(like.count)}</span>
        </button>
        {like.error ? (
          <span role="alert" className="mt-1 text-xs text-danger">
            {like.error}
          </span>
        ) : null}
      </span>
      <ShareButton path={path} title={title} className={buttonClass("secondary", "md")}>
        {(status) => (
          <>
            {status === "copied" ? <CheckIcon size={18} /> : <ShareIcon size={18} />}
            {status === "copied" ? "Link copied" : status === "failed" ? "Copy failed" : "Share"}
          </>
        )}
      </ShareButton>
    </>
  );
}

/** Inline comments section for the watch page, with a live count in its heading. */
export function WatchComments({
  videoId,
  path,
  initialCount,
  viewer,
  viewerName,
}: {
  videoId: string;
  path: string;
  initialCount: number;
  viewer: Viewer;
  viewerName: string | null;
}) {
  const [count, setCount] = useState(initialCount);
  return (
    <section aria-labelledby="comments-heading" className="mt-8">
      <h2 id="comments-heading" className="mb-4 text-lg font-medium text-fg">
        {formatCount(count)} {count === 1 ? "Comment" : "Comments"}
      </h2>
      <CommentsPanel
        videoId={videoId}
        viewer={viewer}
        viewerName={viewerName}
        returnTo={path}
        layout="inline"
        onCountChange={setCount}
      />
    </section>
  );
}
