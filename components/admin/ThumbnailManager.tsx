"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Card, cn } from "@/components/ui";
import { Thumb } from "@/components/admin/ui";
import { pickThumbCandidateAction, uploadThumbnailAction } from "@/lib/admin/actions/videos";
import type { ActionResult } from "@/lib/admin/logic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Draw the current frame of a <video> to a canvas and return it as a JPEG (longest side capped at 1280px). */
export function captureFrame(video: HTMLVideoElement, maxSide = 1280, quality = 0.86): Promise<Blob | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

export function ThumbnailManager({
  videoId,
  currentUrl,
  hasThumb,
  candidateUrls,
  currentCandidate,
  videoSrc,
  vertical,
}: {
  videoId: string;
  /** URL of the current thumbnail (placeholder when none). */
  currentUrl: string;
  hasThumb: boolean;
  candidateUrls: string[];
  /** Index of the candidate currently in use, or -1 for a custom thumbnail. */
  currentCandidate: number;
  videoSrc: string;
  vertical: boolean;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (key: string, fn: () => Promise<ActionResult>) => {
    setResult(null);
    setFileError(null);
    setBusy(key);
    start(async () => {
      try {
        setResult(await fn());
      } catch {
        setResult({ ok: false, error: "Could not reach the server. Check your connection and try again." });
      } finally {
        setBusy(null);
      }
    });
  };

  const upload = (blob: Blob, filename: string, source: "frame" | "upload") => {
    const fd = new FormData();
    fd.set("image", new File([blob], filename, { type: blob.type }));
    fd.set("source", source);
    return uploadThumbnailAction(videoId, null, fd);
  };

  const grabFrame = () =>
    run("frame", async () => {
      const video = videoRef.current;
      if (!video) return { ok: false, error: "The video is not loaded yet." };
      video.pause();
      const blob = await captureFrame(video);
      if (!blob) return { ok: false, error: "Could not read this frame. Wait for the video to load, scrub to another moment and try again." };
      return upload(blob, "frame.jpg", "frame");
    });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setFileError("Only JPG, PNG or WebP images are allowed.");
    if (file.size > MAX_IMAGE_BYTES) return setFileError("Image must be 5 MB or smaller. Resize it and try again.");
    run("upload", async () => {
      const res = await upload(file, "thumb", "upload");
      if (fileRef.current) fileRef.current.value = "";
      return res;
    });
  };

  const message = result ? (result.ok ? result.message : (result.error ?? result.fieldErrors?.image)) : null;
  const frameClass = vertical ? "aspect-[9/16] w-28" : "aspect-video w-full";

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="text-base font-medium text-fg">Thumbnail</h2>
        <p className="mt-1 text-sm text-muted">The image shown on cards and in search. Pick a candidate, grab a frame, or upload your own.</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Current</p>
        <Thumb src={currentUrl} alt="Current thumbnail" className={cn("rounded-xl border border-line", vertical ? "aspect-[9/16] w-36" : "aspect-video w-full max-w-sm")} />
        {!hasThumb ? <p className="mt-2 text-sm text-warning">No thumbnail yet. Viewers see a placeholder until you set one.</p> : null}
      </div>

      {message ? <Alert tone={result?.ok ? "success" : "danger"}>{message}</Alert> : null}

      <section aria-labelledby="thumb-candidates">
        <h3 id="thumb-candidates" className="text-sm font-medium text-fg">
          1. Pick a candidate from YoYo Studio
        </h3>
        {candidateUrls.length === 0 ? (
          <p className="mt-1 text-sm text-muted">This video has no Studio candidates (it was uploaded in the browser). Use option 2 or 3.</p>
        ) : (
          <ul className={cn("mt-3 grid gap-3", vertical ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-3")}>
            {candidateUrls.map((url, i) => {
              const selected = i === currentCandidate;
              return (
                <li key={url}>
                  <button
                    type="button"
                    disabled={pending || selected}
                    aria-pressed={selected}
                    aria-label={`Use candidate ${i + 1}${selected ? " (current)" : ""}`}
                    onClick={() => run(`c${i}`, () => pickThumbCandidateAction(videoId, i))}
                    className={cn(
                      "relative block w-full overflow-hidden rounded-xl border-2 transition-colors",
                      selected ? "border-brand" : "border-line hover:border-muted",
                      busy === `c${i}` && "opacity-60",
                    )}
                  >
                    <Thumb src={url} className={cn("w-full", vertical ? "aspect-[9/16]" : "aspect-video")} />
                    {selected ? <span className="absolute left-1.5 top-1.5 rounded-lg bg-brand px-2 py-0.5 text-[10px] font-medium text-white">In use</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="thumb-frame">
        <h3 id="thumb-frame" className="text-sm font-medium text-fg">
          2. Grab a frame from the video
        </h3>
        {!pickerOpen ? (
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setPickerOpen(true)}>
            Open frame picker
          </Button>
        ) : videoFailed ? (
          <div className="mt-3 space-y-2">
            <Alert tone="warning">The video file could not be loaded in this browser, so a frame cannot be grabbed. Upload a custom image instead, or try again.</Alert>
            <Button type="button" variant="secondary" size="sm" onClick={() => setVideoFailed(false)}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              playsInline
              muted
              preload="metadata"
              onError={() => setVideoFailed(true)}
              className={cn("rounded-xl border border-line bg-black", frameClass, !vertical && "max-w-xl")}
            />
            <p className="text-sm text-muted">Play or scrub to the moment you want, pause, then press the button.</p>
            <Button type="button" size="sm" disabled={pending} aria-busy={busy === "frame"} onClick={grabFrame}>
              {busy === "frame" ? "Saving frame…" : "Use this frame"}
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="thumb-upload">
        <h3 id="thumb-upload" className="text-sm font-medium text-fg">
          3. Upload a custom image
        </h3>
        <label htmlFor="thumb-file" className="mt-1 block text-sm text-muted">
          JPG, PNG or WebP, up to 5 MB. 1280×720 works best{vertical ? " (720×1280 for shorts)" : ""}.
        </label>
        <input
          ref={fileRef}
          id="thumb-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          aria-invalid={fileError ? true : undefined}
          aria-describedby={fileError ? "thumb-file-err" : undefined}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="mt-3 block w-full max-w-sm text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-4 file:text-sm file:font-medium file:text-fg"
        />
        {busy === "upload" ? <p className="mt-2 text-sm text-muted" role="status">Uploading image…</p> : null}
        {fileError ? (
          <p id="thumb-file-err" role="alert" className="mt-2 text-sm text-danger">
            {fileError}
          </p>
        ) : null}
      </section>
    </Card>
  );
}
