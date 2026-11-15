"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, ButtonLink, Card, Field } from "@/components/ui";
import { SuccessState } from "@/components/states";
import { SelectField, Thumb } from "@/components/admin/ui";
import { captureFrame } from "@/components/admin/ThumbnailManager";
import { uploadThumbnailAction } from "@/lib/admin/actions/videos";
import { MAX_SMALL_UPLOAD_BYTES, suggestVideoType } from "@/lib/admin/logic";
import { formatBytes, formatDuration } from "@/lib/format";

type Meta = { duration: number; width: number; height: number };
type Phase = "idle" | "uploading" | "finishing" | "done";

const ACCEPT = ["video/mp4", "video/webm"];
const SLOW_BYTES_PER_SEC = 150 * 1024;

function titleFromFilename(name: string) {
  return name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

function eta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `about ${Math.ceil(seconds)} s left`;
  return `about ${Math.ceil(seconds / 60)} min left`;
}

/** Read duration and dimensions and grab a frame for the thumbnail, all in the browser. */
function probeVideo(url: string): Promise<{ meta: Meta; thumb: Blob | null }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    const finish = async (withFrame: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const meta = { duration: Number.isFinite(video.duration) ? video.duration : 0, width: video.videoWidth, height: video.videoHeight };
      const thumb = withFrame ? await captureFrame(video).catch(() => null) : null;
      video.removeAttribute("src");
      video.load();
      resolve({ meta, thumb });
    };
    // If the browser can read metadata but cannot seek/decode, continue without a thumbnail.
    const timer = setTimeout(() => (video.videoWidth ? finish(false) : !settled && ((settled = true), reject(new Error("timeout")))), 15000);
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = d > 0 ? Math.min(Math.max(d * 0.25, 0.5), Math.max(d - 0.1, 0)) : 0;
    };
    video.onseeked = () => finish(true);
    video.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("unreadable"));
    };
    video.src = url;
  });
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [type, setType] = useState<"LONG" | "SHORT">("LONG");
  const [suggested, setSuggested] = useState<"LONG" | "SHORT" | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ loaded: 0, total: 0, speed: 0 });
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<{ text: string; fault: "yours" | "ours" | "network" } | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [thumbNote, setThumbNote] = useState<string | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewUrlRef = useRef<string | null>(null);
  const applyThumb = (blob: Blob | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = blob ? URL.createObjectURL(blob) : null;
    setThumb(blob);
    setThumbPreview(previewUrlRef.current);
  };
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  // Abort an in-flight upload if the admin leaves the page.
  useEffect(() => () => xhrRef.current?.abort(), []);

  // Warn before closing the tab mid-upload.
  useEffect(() => {
    if (phase !== "uploading") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const onPick = async (picked: File | undefined) => {
    setError(null);
    setFileError(null);
    setMeta(null);
    applyThumb(null);
    setSuggested(null);
    setFile(null);
    if (!picked) return;

    if (!ACCEPT.includes(picked.type) && !/\.(mp4|m4v|webm)$/i.test(picked.name)) {
      return setFileError("Only MP4 or WebM videos can be uploaded here. Export the video as MP4 (H.264) and pick it again.");
    }
    if (picked.size > MAX_SMALL_UPLOAD_BYTES) {
      return setFileError(
        `This file is ${formatBytes(picked.size)}, over the 500 MB limit for browser uploads. Use YoYo Studio for big files: it compresses the video and resumes if the connection drops.`,
      );
    }
    if (picked.size === 0) return setFileError("This file is empty. Pick another one.");

    setFile(picked);
    if (!title.trim()) setTitle(titleFromFilename(picked.name));
    setProbing(true);
    const url = URL.createObjectURL(picked);
    try {
      const res = await probeVideo(url);
      setMeta(res.meta);
      applyThumb(res.thumb);
      const s = suggestVideoType(res.meta.width, res.meta.height, res.meta.duration);
      setSuggested(s);
      setType(s);
    } catch {
      // Not fatal: the server still verifies the real file type. Duration can be fixed by re-pushing through Studio.
      setFileError("Your browser could not read this video, so its duration and thumbnail could not be read. You can still upload it and set a thumbnail afterwards.");
    } finally {
      URL.revokeObjectURL(url);
      setProbing(false);
    }
  };

  const startUpload = () => {
    setError(null);
    setTitleError(null);
    if (!file) return setFileError("Choose a video file first.");
    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) return setTitleError("Give the video a title (at least 2 characters).");

    const qs = new URLSearchParams({ title: cleanTitle, type, duration: String(Math.round(meta?.duration ?? 0)) });
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `/api/admin/upload?${qs.toString()}`);
    xhr.responseType = "json";
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    const startedAt = performance.now();
    let last = { t: startedAt, loaded: 0 };
    let speed = 0;
    xhr.upload.onprogress = (e) => {
      const now = performance.now();
      const dt = (now - last.t) / 1000;
      if (dt >= 0.5) {
        const instant = (e.loaded - last.loaded) / dt;
        speed = speed === 0 ? instant : speed * 0.7 + instant * 0.3;
        last = { t: now, loaded: e.loaded };
        // Only call it slow after a few seconds, once the average has settled.
        setSlow(now - startedAt > 5000 && speed < SLOW_BYTES_PER_SEC && e.loaded < e.total);
      }
      setProgress({ loaded: e.loaded, total: e.total || file.size, speed });
      if (e.loaded >= e.total) setPhase("finishing");
    };
    xhr.onload = async () => {
      xhrRef.current = null;
      const body = (xhr.response ?? {}) as { id?: string; error?: string };
      if (xhr.status === 201 && body.id) {
        setPhase("finishing");
        if (thumb) {
          try {
            const fd = new FormData();
            fd.set("image", new File([thumb], "frame.jpg", { type: "image/jpeg" }));
            fd.set("source", "frame");
            const res = await uploadThumbnailAction(body.id, null, fd);
            if (!res.ok) setThumbNote("The thumbnail could not be saved automatically. Set one on the edit page.");
          } catch {
            setThumbNote("The thumbnail could not be saved automatically. Set one on the edit page.");
          }
        } else {
          setThumbNote("No thumbnail was captured. Set one on the edit page.");
        }
        setVideoId(body.id);
        setPhase("done");
        return;
      }
      setPhase("idle");
      if (xhr.status === 401) return setError({ text: "Your session expired during the upload. Sign in again in another tab, then press Upload again.", fault: "yours" });
      if (xhr.status === 403) return setError({ text: body.error ?? "This account is not allowed to upload. Sign in as an admin with two-step verification enabled.", fault: "yours" });
      if (xhr.status >= 500 && xhr.status !== 507) return setError({ text: body.error ?? "The server could not save the file. Wait a minute and try again.", fault: "ours" });
      setError({ text: body.error ?? `The upload was rejected (error ${xhr.status}). Check the file and try again.`, fault: "yours" });
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setPhase("idle");
      setError({ text: "The connection dropped before the upload finished. Check your internet and press Upload again. For unstable connections use YoYo Studio, which resumes where it stopped.", fault: "network" });
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setPhase("idle");
    };

    setProgress({ loaded: 0, total: file.size, speed: 0 });
    setSlow(false);
    setPhase("uploading");
    xhr.send(file);
  };

  const reset = () => {
    setFile(null);
    setMeta(null);
    applyThumb(null);
    setTitle("");
    setType("LONG");
    setSuggested(null);
    setVideoId(null);
    setThumbNote(null);
    setError(null);
    setFileError(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  if (phase === "done" && videoId) {
    return (
      <Card>
        <SuccessState
          title="Upload complete"
          message={`"${title.trim()}" is saved as a draft. It is not visible to subscribers yet.`}
          next={thumbNote ?? "Next: add a description, pick the channel, check the thumbnail and publish."}
          actionHref={`/admin/videos/${videoId}?uploaded=1`}
          actionLabel="Edit details & publish"
        />
        <div className="-mt-10 pb-10 text-center">
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Upload another video
          </Button>
        </div>
      </Card>
    );
  }

  const busy = phase === "uploading" || phase === "finishing";
  const pct = progress.total > 0 ? Math.min(100, (progress.loaded / progress.total) * 100) : 0;
  const remaining = progress.speed > 0 ? (progress.total - progress.loaded) / progress.speed : NaN;

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) startUpload();
      }}
    >
      <Card className="space-y-5 p-5">
        <div className="space-y-1.5">
          <label htmlFor="upload-file" className="block text-sm font-medium text-fg">
            Video file
          </label>
          <input
            ref={inputRef}
            id="upload-file"
            type="file"
            accept="video/mp4,video/webm,.mp4,.m4v,.webm"
            disabled={busy}
            aria-invalid={fileError && !file ? true : undefined}
            aria-describedby="upload-file-help"
            onChange={(e) => onPick(e.target.files?.[0])}
            className="block w-full text-sm text-muted file:mr-3 file:h-10 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-5 file:text-sm file:font-medium file:text-fg"
          />
          <p id="upload-file-help" className="text-sm text-muted">
            MP4 or WebM, up to 500 MB.
          </p>
          {fileError ? (
            <p role="alert" className={file ? "text-sm text-warning" : "text-sm text-danger"}>
              {fileError}
            </p>
          ) : null}
        </div>

        {probing ? (
          <p className="text-sm text-muted" role="status">
            Reading the video…
          </p>
        ) : null}

        {file && !probing ? (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2/50 p-3">
            {thumbPreview ? (
              <Thumb src={thumbPreview} alt="Captured thumbnail" className={meta && meta.height > meta.width ? "h-24 w-[3.4rem] rounded-md" : "h-20 w-36 rounded-md"} />
            ) : (
              <div className="grid h-20 w-36 place-items-center rounded-md bg-surface-2 text-xs text-muted">No image</div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Size</dt>
              <dd className="text-fg">{formatBytes(file.size)}</dd>
              {meta ? (
                <>
                  <dt className="text-muted">Duration</dt>
                  <dd className="text-fg">{formatDuration(meta.duration)}</dd>
                  <dt className="text-muted">Dimensions</dt>
                  <dd className="text-fg">
                    {meta.width}×{meta.height} ({meta.height > meta.width ? "vertical" : "horizontal"})
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        <Field label="Title" name="title" required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} error={titleError ?? undefined} hint="You can change this and add the other details after the upload." />

        <SelectField
          label="Type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value === "SHORT" ? "SHORT" : "LONG")}
          disabled={busy}
          className="max-w-xs"
          hint={
            suggested === "SHORT"
              ? "Suggested: Short, because this video is vertical and 90 seconds or less."
              : suggested === "LONG"
                ? "Suggested: Video. Shorts are vertical and 90 seconds or less."
                : "Shorts are vertical and 90 seconds or less."
          }
        >
          <option value="LONG">Video</option>
          <option value="SHORT">Short</option>
        </SelectField>
      </Card>

      {busy ? (
        <Card className="space-y-3 p-5" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="font-medium text-fg">{phase === "finishing" ? "Saving on the server…" : `Uploading… ${pct.toFixed(0)}%`}</p>
            <p className="tabular-nums text-muted">
              {formatBytes(progress.loaded)} of {formatBytes(progress.total)}
              {progress.speed > 0 && phase === "uploading" ? ` · ${formatBytes(progress.speed)}/s · ${eta(remaining)}` : ""}
            </p>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          {slow && phase === "uploading" ? (
            <Alert tone="warning">
              Your connection is slow right now ({formatBytes(progress.speed)}/s). Keep this tab open and the upload will continue. If it keeps dropping, cancel and use YoYo Studio, which resumes interrupted uploads.
            </Alert>
          ) : null}
          <Button type="button" variant="secondary" size="sm" disabled={phase === "finishing"} onClick={() => xhrRef.current?.abort()}>
            Cancel upload
          </Button>
        </Card>
      ) : null}

      {error ? (
        <Alert>
          {error.text}{" "}
          <span className="opacity-80">
            {error.fault === "network" ? "(Connection problem.)" : error.fault === "ours" ? "(Problem on our side, not something you did.)" : ""}
          </span>
        </Alert>
      ) : null}

      {!busy ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!file || probing}>
            {error ? "Try upload again" : "Upload"}
          </Button>
          <ButtonLink href="/admin/videos" variant="ghost">
            Cancel
          </ButtonLink>
        </div>
      ) : null}
    </form>
  );
}
