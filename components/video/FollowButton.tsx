"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Burst, FollowToast } from "@/components/effects";
import { CheckIcon, PlusIcon } from "@/components/shell/icons";
import { buttonClass, cn } from "@/components/ui";
import { setFollowAction } from "@/lib/follow/actions";

const FOLLOW_LABELS = { off: "Follow", on: "Following" };
export const SUBSCRIBE_LABELS = { off: "Subscribe", on: "Subscribed" };

/**
 * Optimistic Follow / Following toggle for a channel or model.
 * Signed-out visitors are sent to sign in and brought back (`loginNext`).
 * The server action re-checks the session; this component only reflects state.
 */
export function FollowButton({
  kind,
  targetId,
  name,
  initialFollowing,
  signedIn,
  loginNext,
  size = "md",
  className,
  labels = FOLLOW_LABELS,
}: {
  kind: "channel" | "model";
  targetId: string;
  /** Used for the accessible label, e.g. "Follow Night Shift". */
  name: string;
  initialFollowing: boolean;
  signedIn: boolean;
  /** Path to return to after signing in. */
  loginNext: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Button wording. Shorts use Subscribe / Subscribed; it is still the same follow. */
  labels?: { off: string; on: string };
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [optimistic, setOptimistic] = useOptimistic(following);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0); // counts up on each new follow; 0 = no effect showing
  const loginHref = `/login?next=${encodeURIComponent(loginNext)}`;

  const onClick = () => {
    if (!signedIn) {
      router.push(loginHref);
      return;
    }
    const next = !optimistic;
    setError(null);
    // Celebrate straight away so it feels instant on a slow connection; take it back if the save fails.
    setCelebrate(next ? (c) => c + 1 : 0);
    startTransition(async () => {
      setOptimistic(next);
      try {
        const res = await setFollowAction({ kind, id: targetId, follow: next });
        if (res.ok) setFollowing(res.following);
        else {
          setCelebrate(0);
          if (res.loginRequired) router.push(loginHref);
          else setError(res.error);
        }
      } catch {
        setCelebrate(0);
        setError("Could not update. Check your connection and try again.");
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={optimistic}
        aria-busy={pending}
        aria-label={optimistic ? `${labels.on}: ${name}. Press to undo` : `${labels.off}: ${name}`}
        className={buttonClass(optimistic ? "secondary" : "primary", size, cn("relative", className))}
      >
        <span key={optimistic ? celebrate : 0} className={`grid place-items-center ${celebrate && optimistic ? "fx-pop" : ""}`}>
          {optimistic ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
        </span>
        {optimistic ? labels.on : labels.off}
        <Burst trigger={optimistic ? celebrate : 0} kind="confetti" radius={46} />
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
      <FollowToast show={celebrate} name={name} subscribe={labels.off === SUBSCRIBE_LABELS.off} onClose={() => setCelebrate(0)} />
    </span>
  );
}
