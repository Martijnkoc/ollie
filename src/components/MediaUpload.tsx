"use client";

import { useRef, useState } from "react";
import { Upload } from "./Icons";

type Uploaded = { id: string; url: string; kind: "image" | "video" };

const ACCEPT = {
  image: "image/jpeg,image/png,image/webp",
  media: "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime",
};

/**
 * Three steps: ask the server for an upload slot, send the file there, let the server check what arrived.
 * The form only receives the id of a checked file (hidden input `name`).
 */
export function MediaUpload({
  name,
  purpose,
  label,
  hint,
  initialUrl,
  initialId,
  shape = "wide",
  allowVideo = false,
  onUploaded,
  required,
}: {
  name: string;
  purpose: "avatar" | "cover" | "service" | "portfolio";
  label: string;
  hint?: string;
  initialUrl?: string | null;
  initialId?: string | null;
  shape?: "wide" | "round";
  allowVideo?: boolean;
  onUploaded?: (u: Uploaded) => void;
  required?: boolean;
}) {
  const [media, setMedia] = useState<Uploaded | null>(initialUrl && initialId ? { id: initialId, url: initialUrl, kind: "image" } : null);
  const [status, setStatus] = useState<"idle" | "uploading" | "checking">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = `upload-${name}`;

  async function upload(file: File) {
    setError(undefined);
    setStatus("uploading");
    setProgress(0);
    try {
      const start = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose, contentType: file.type, size: file.size }),
      });
      const ticket = await start.json();
      if (!start.ok) throw new Error(ticket.error ?? "Uploaden lukte niet.");
      await new Promise<void>((resolve, reject) => {
        // XHR instead of fetch: it reports upload progress.
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", ticket.uploadUrl);
        for (const [k, v] of Object.entries(ticket.headers as Record<string, string>)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () =>
          xhr.status < 300 ? resolve() : reject(new Error(safeError(xhr.responseText) ?? "Het bestand kwam niet goed aan."));
        xhr.onerror = () => reject(new Error("De verbinding viel weg tijdens het uploaden."));
        xhr.send(file);
      });
      setStatus("checking");
      const done = await fetch(`/api/uploads/${ticket.id}/klaar`, { method: "POST" });
      const checked = await done.json();
      if (!done.ok) throw new Error(checked.error ?? "Het bestand is afgekeurd.");
      setMedia(checked);
      onUploaded?.(checked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uploaden lukte niet.");
    } finally {
      setStatus("idle");
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="upload field">
      <span className="label" id={`${id}-label`}>
        {label}
      </span>
      <input type="hidden" name={name} value={media?.id ?? ""} />
      {media && (
        <div className={`upload-preview${shape === "round" ? " round" : ""}`}>
          {media.kind === "video" ? (
            <video src={media.url} muted playsInline controls preload="metadata" />
          ) : (
            <img src={media.url} alt="" />
          )}
        </div>
      )}
      <label
        className={`upload-drop${over ? " over" : ""}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={() => setOver(false)}
      >
        <Upload />
        <span>
          <strong style={{ color: "var(--ink)" }}>{media ? "Ander bestand kiezen" : "Kies een bestand"}</strong> of sleep het hierheen
        </span>
        <span className="hint">{hint ?? (allowVideo ? "JPG, PNG, WebP of video (MP4, WebM, MOV)" : "JPG, PNG of WebP")}</span>
        <input
          ref={input}
          id={id}
          type="file"
          accept={allowVideo ? ACCEPT.media : ACCEPT.image}
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? `${id}-error` : undefined}
          required={required && !media}
          disabled={status !== "idle"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      <div aria-live="polite">
        {status === "uploading" && (
          <div className="stack-sm">
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Uploaden"
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className="hint">Uploaden… {progress}%</span>
          </div>
        )}
        {status === "checking" && <span className="hint">Controleren…</span>}
        {error && (
          <p className="notice error small" role="alert" id={`${id}-error`}>
            {error}
          </p>
        )}
      </div>
      {media && shape !== "round" && purpose !== "portfolio" && (
        <button type="button" className="link-button small" onClick={() => setMedia(null)}>
          Verwijderen
        </button>
      )}
    </div>
  );
}

function safeError(text: string) {
  try {
    return (JSON.parse(text) as { error?: string }).error;
  } catch {
    return undefined;
  }
}
