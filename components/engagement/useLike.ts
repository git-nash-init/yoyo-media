"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { setLikeAction } from "@/lib/engagement/actions";
import type { Viewer } from "@/lib/engagement/types";

/** Where to send someone who is not allowed to like/comment yet. */
export function gateHref(viewer: Viewer, returnTo: string): string | null {
  if (!viewer.signedIn) return `/login?next=${encodeURIComponent(returnTo)}`;
  if (!viewer.isSubscriber) return `/subscribe?next=${encodeURIComponent(returnTo)}`;
  return null;
}

/**
 * Optimistic like state. The heart flips immediately; the server's answer (with
 * the real count) then replaces it, or the last confirmed state is restored on failure.
 */
export function useLike({
  videoId,
  initialLiked,
  initialCount,
  viewer,
  returnTo,
}: {
  videoId: string;
  initialLiked: boolean;
  initialCount: number;
  viewer: Viewer;
  returnTo: string;
}) {
  const router = useRouter();
  const [state, setState] = useState({ liked: initialLiked, count: initialCount });
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0); // counts up each time the viewer likes (never on un-like)
  const confirmed = useRef({ liked: initialLiked, count: initialCount });
  const wanted = useRef(initialLiked);
  const seq = useRef(0);

  const set = useCallback(
    (want: boolean) => {
      const gate = gateHref(viewer, returnTo);
      if (gate) {
        router.push(gate);
        return;
      }
      if (wanted.current === want) return;
      wanted.current = want;
      setError(null);
      if (want) setBurst((b) => b + 1);
      setState((prev) => ({ liked: want, count: Math.max(0, prev.count + (want ? 1 : -1)) }));
      const mine = ++seq.current;
      setLikeAction({ videoId, like: want })
        .then((res) => {
          if (mine !== seq.current) return; // a newer tap superseded this one
          if (res.ok) {
            confirmed.current = { liked: res.liked, count: res.likeCount };
            setState(confirmed.current);
          } else {
            wanted.current = confirmed.current.liked;
            setState(confirmed.current);
            if (res.gate) router.push(gateHref({ signedIn: res.gate !== "login", isSubscriber: false }, returnTo) ?? "/login");
            else setError(res.error);
          }
        })
        .catch(() => {
          if (mine !== seq.current) return;
          wanted.current = confirmed.current.liked;
          setState(confirmed.current);
          setError("Couldn't save your like. Check your connection.");
        });
    },
    [router, viewer, returnTo, videoId],
  );

  return {
    liked: state.liked,
    count: state.count,
    error,
    burst,
    toggle: () => set(!wanted.current),
    like: () => set(true),
  };
}

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
export const formatCount = (n: number) => compact.format(Math.max(0, n));
