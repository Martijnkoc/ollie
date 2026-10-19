"use client";

import { useEffect, useRef, useState } from "react";
import { CAMERA_MEASURE } from "@/config/site";
import { formatMm } from "@/lib/format";
import {
  CAMERA_TASKS,
  cameraResults,
  measureShot,
  newShotId,
  type CameraShot,
  type CameraTarget,
  type CameraTask,
} from "@/lib/measurements/camera";
import { cameraError, detectCapabilities, type Capabilities } from "@/lib/measurements/capabilities";
import { grayFromRgba, type Gray } from "@/lib/measurements/edges";
import { REFERENCES, type Marked, type Orientation } from "@/lib/measurements/photo";
import { MEASURE_INFO, type MeasureKey } from "@/lib/measurements/schema";
import { deletePhoto, loadPhoto, savePhoto, shotPhotoKey } from "@/lib/projects/store";
import { PhotoMarker, type MarkerGroup } from "./PhotoMarker";

type Photo = { url: string; blob: Blob | null; width: number; height: number };
type Draft = {
  task: CameraTask;
  id: string;
  photo: Photo;
  points: Marked[];
  snapped: boolean[];
  orientation: Orientation;
  takenAt: string;
};

const REF_COLOR = "#b98c3c";
const MARK_COLOR = "#1f6f50";

export const targetLabel = (t: CameraTarget) => (t === "plafondhoogte" ? "Plafondhoogte" : MEASURE_INFO[t as MeasureKey].label);

async function toJpeg(source: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, CAMERA_MEASURE.maxPhotoSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("foto");
  return { blob, width: canvas.width, height: canvas.height };
}

/** Greyscale pixels of the photo, for snapping points onto edges. Computed on this device. */
async function grayOf(url: string, width: number, height: number): Promise<Gray> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);
  return grayFromRgba(ctx.getImageData(0, 0, width, height).data, width, height);
}

/**
 * Measuring with the camera instead of a tape measure, for one window or for the home (ceiling height).
 * Per task: a photo with a reference in the measured plane, the reference corners and the measuring points
 * tapped (corners snap to edges), the values with their uncertainty. Photos stay on this device; the camera
 * is only asked for when the user starts it.
 */
export function CameraMeasure({
  projectId,
  owner,
  heading,
  tasks,
  shots,
  onSave,
  onClose,
}: {
  projectId: string;
  /** Window id, or "woning" for measurements of the whole home. */
  owner: string;
  heading: string;
  tasks: CameraTask[];
  shots: CameraShot[];
  onSave: (shots: CameraShot[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [view, setView] = useState<
    { kind: "overview" } | { kind: "capture"; task: CameraTask } | { kind: "camera"; task: CameraTask } | { kind: "mark" }
  >(tasks.length === 1 && !shots.length ? { kind: "capture", task: tasks[0]! } : { kind: "overview" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [gray, setGray] = useState<Gray | null>(null);
  const [snap, setSnap] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    void detectCapabilities().then(setCaps);
  }, []);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stopCamera, []);

  // Greyscale for snapping, whenever the photo being marked changes.
  const draftUrl = draft?.photo.url;
  useEffect(() => {
    setGray(null);
    if (!draft) return;
    let cancelled = false;
    void grayOf(draft.photo.url, draft.photo.width, draft.photo.height)
      .then((g) => !cancelled && setGray(g))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftUrl]);

  function begin(task: CameraTask, photo: Photo) {
    setDraft({ task, id: newShotId(), photo, points: [], snapped: [], orientation: "auto", takenAt: new Date().toISOString() });
    setView({ kind: "mark" });
  }

  async function choose(task: CameraTask, file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 30 * 1024 * 1024) {
      setError("Kies een foto (JPG, PNG, of HEIC als je browser die kan openen) van maximaal 30 MB.");
      return;
    }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const shot = await toJpeg(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      begin(task, { url: URL.createObjectURL(shot.blob), ...shot });
    } catch {
      setError("Deze foto kunnen we niet openen. Kies een andere, of maak de foto met je camera-app als JPG.");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera(task: CameraTask) {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } },
        audio: false,
      });
      setView({ kind: "camera", task });
      requestAnimationFrame(() => {
        if (video.current && stream.current) {
          video.current.srcObject = stream.current;
          void video.current.play().catch(() => undefined);
        }
      });
    } catch (err) {
      setError(cameraError(err));
    }
  }

  async function capture(task: CameraTask) {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    try {
      // A full-resolution still where the browser offers one (ImageCapture); otherwise the video frame.
      const track = stream.current?.getVideoTracks()[0];
      const IC = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
      let shot: { blob: Blob; width: number; height: number } | null = null;
      if (IC && track) {
        try {
          const bitmap = await createImageBitmap(await new IC(track).takePhoto());
          shot = await toJpeg(bitmap, bitmap.width, bitmap.height);
          bitmap.close();
        } catch {
          shot = null;
        }
      }
      shot ??= await toJpeg(v, v.videoWidth, v.videoHeight);
      stopCamera();
      begin(task, { url: URL.createObjectURL(shot.blob), ...shot });
    } finally {
      setBusy(false);
    }
  }

  async function edit(shot: CameraShot) {
    const blob = await loadPhoto(projectId, shotPhotoKey(owner, shot.id));
    if (!blob) {
      setError("Deze foto staat niet meer op dit apparaat. Verwijder de meting en maak een nieuwe foto.");
      return;
    }
    setDraft({
      task: CAMERA_TASKS[shot.task],
      id: shot.id,
      photo: { url: URL.createObjectURL(blob), blob: null, width: shot.width, height: shot.height },
      points: [...shot.reference, ...shot.points],
      snapped: shot.snapped.length === shot.reference.length + shot.points.length ? shot.snapped : [],
      orientation: shot.orientation,
      takenAt: shot.takenAt,
    });
    setView({ kind: "mark" });
  }

  async function remove(shot: CameraShot) {
    await deletePhoto(projectId, shotPhotoKey(owner, shot.id));
    onSave(shots.filter((s) => s.id !== shot.id));
  }

  const result =
    draft && draft.points.length === refCount(draft.task) + markCount(draft.task)
      ? measureShot(draft.task, {
          reference: draft.points.slice(0, refCount(draft.task)),
          points: draft.points.slice(refCount(draft.task)),
          orientation: draft.orientation,
        })
      : null;
  const referencePx =
    draft && draft.points.length >= 4
      ? Math.min(
          ...draft.points
            .slice(0, Math.min(refCount(draft.task), Math.floor(draft.points.length / 4) * 4))
            .map((_, i, all) => side(all, i)),
        )
      : null;

  async function save() {
    if (!draft || !result?.ok) return;
    if (draft.photo.blob) await savePhoto(projectId, shotPhotoKey(owner, draft.id), draft.photo.blob);
    const shot: CameraShot = {
      id: draft.id,
      task: draft.task.id,
      takenAt: draft.takenAt,
      width: draft.photo.width,
      height: draft.photo.height,
      orientation: draft.orientation,
      reference: draft.points.slice(0, refCount(draft.task)),
      points: draft.points.slice(refCount(draft.task)),
      snapped: draft.snapped,
      values: result.values,
    };
    onSave([...shots.filter((s) => s.id !== shot.id), shot]);
    URL.revokeObjectURL(draft.photo.url);
    setDraft(null);
    setView({ kind: "overview" });
  }

  const groups: MarkerGroup[] = draft
    ? [
        ...Array.from({ length: draft.task.references }, (_, k) => ({
          title: `${REFERENCES[draft.task.reference].label}${draft.task.references > 1 ? ` ${k + 1} (${k === 0 ? "links" : "rechts"})` : ""}`,
          labels: ["linksboven", "rechtsboven", "rechtsonder", "linksonder"],
          shape: "quad" as const,
          color: REF_COLOR,
        })),
        {
          title: draft.task.shape.kind === "rect" ? draft.task.title : "Meetpunt",
          labels: draft.task.points,
          shape: draft.task.shape.kind === "rect" ? ("quad" as const) : ("lines" as const),
          color: MARK_COLOR,
        },
      ]
    : [];

  return (
    <dialog ref={dialog} className="sheet sheet-wide" aria-labelledby="camera-titel" onClose={onClose} onCancel={onClose}>
      <div className="sheet-head">
        <div>
          <p className="tiny muted" style={{ margin: 0 }}>
            {heading}
          </p>
          <h2 id="camera-titel" style={{ fontSize: "1.3rem", margin: 0 }}>
            Meten met je camera
          </h2>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => dialog.current?.close()} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        {view.kind === "overview" && (
          <>
            <p className="small" style={{ margin: 0 }}>
              Geen rolmaat nodig: <strong>twee A4-vellen</strong> op de muur geven de schaal en het perspectief (voor de diepte een{" "}
              <strong>bankpas</strong>). Per foto zie je elke maat met zijn foutmarge. Een tweede foto van een iets andere plek vangt een
              verkeerde tik of een verschoven vel op.
            </p>
            <ul className="task-list" aria-label="Wat je meet">
              {tasks.map((task) => {
                const own = shots.filter((s) => s.task === task.id);
                const results = cameraResults(own).filter((r) => task.targets.includes(r.target));
                return (
                  <li key={task.id} className="card-flat stack-sm">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{task.title}</strong>
                      <span
                        className={`badge ${own.length ? "" : "badge-neutral"}`}
                        data-status={own.length ? (results.every((r) => r.usable) ? "confirmed" : "check") : undefined}
                      >
                        {own.length
                          ? `${own.length} foto${own.length > 1 ? "'s" : ""} · ${results.every((r) => r.usable) ? "gemeten" : "controleren"}`
                          : "Nog geen foto"}
                      </span>
                    </div>
                    {results.length > 0 && (
                      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                        {results.map((r) => (
                          <li key={r.target}>
                            {targetLabel(r.target)}: {formatMm(Math.round(r.mm))} ± {formatMm(r.uncertaintyMm)}
                            {r.reason ? ` — ${r.reason}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {own.length > 0 && own.length < CAMERA_MEASURE.recommendedShots && results.every((r) => r.usable) && (
                      <p className="tiny muted" style={{ margin: 0 }}>
                        Tip: maak nog een foto van een iets andere plek. Komen beide uit op dezelfde maat, dan klopt hij.
                      </p>
                    )}
                    <div className="row">
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => setView({ kind: "capture", task })}>
                        {own.length ? "Nog een foto" : "Foto maken"}
                      </button>
                      {own.map((s, i) => (
                        <span key={s.id} className="row" style={{ gap: 4 }}>
                          <button type="button" className="btn btn-sm" onClick={() => void edit(s)}>
                            Foto {i + 1} aanpassen
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            aria-label={`Foto ${i + 1} van ${task.title.toLowerCase()} verwijderen`}
                            onClick={() => void remove(s)}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="tiny muted" style={{ margin: 0 }}>
              De foutmarge bevat de onzekerheid van elk aangetikt punt en een vaste marge van{" "}
              {String(CAMERA_MEASURE.systematicPercent).replace(".", ",")} % voor lensvervorming en een vel dat net niet in het vlak ligt.
              Die vaste marge is een aanname tot we genoeg ramen met rolmaat én camera hebben vergeleken.
            </p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => dialog.current?.close()}>
                Klaar
              </button>
            </div>
          </>
        )}

        {view.kind === "capture" && (
          <>
            <h3 style={{ margin: 0 }}>{view.task.title}</h3>
            <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
              {view.task.setup.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="row">
              <label className="btn btn-primary">
                Foto maken
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="visually-hidden"
                  disabled={busy}
                  onChange={(e) => void choose(view.task, e.target.files?.[0])}
                />
              </label>
              <label className="btn">
                Foto kiezen
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  disabled={busy}
                  onChange={(e) => void choose(view.task, e.target.files?.[0])}
                />
              </label>
              {caps?.camera && (
                <button type="button" className="btn" onClick={() => void startCamera(view.task)}>
                  Camera in de browser
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setView({ kind: "overview" })}>
                Terug
              </button>
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              &ldquo;Foto maken&rdquo; opent de camera-app van je telefoon: die maakt de scherpste foto. De foto blijft op dit apparaat.
            </p>
          </>
        )}

        {view.kind === "camera" && (
          <div className="stack-sm">
            <p className="small" style={{ margin: 0 }} aria-live="polite">
              Alles in beeld, recht ervoor. Houd je telefoon stil.
            </p>
            <div className="camera-frame">
              <video ref={video} playsInline muted autoPlay aria-label="Camerabeeld" />
              <span className="camera-guide" aria-hidden="true" />
            </div>
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void capture(view.task)}>
                Foto maken
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  stopCamera();
                  setView({ kind: "capture", task: view.task });
                }}
              >
                Stoppen
              </button>
            </div>
          </div>
        )}

        {view.kind === "mark" && draft && (
          <div className="stack-sm">
            <h3 style={{ margin: 0 }}>{draft.task.title}</h3>
            <PhotoMarker
              photo={draft.photo}
              gray={gray}
              groups={groups}
              points={draft.points}
              snapped={draft.snapped}
              snap={snap}
              onChange={(points, snapped) => setDraft((d) => (d ? { ...d, points, snapped } : d))}
            />
            <div className="row" style={{ gap: "6px 14px" }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!draft.points.length}
                onClick={() => setDraft((d) => (d ? { ...d, points: d.points.slice(0, -1), snapped: d.snapped.slice(0, -1) } : d))}
              >
                Laatste punt weg
              </button>
              <label className="check small">
                <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
                <span>Hoeken vastklikken op randen</span>
              </label>
              <label className="small row" style={{ gap: 6 }}>
                {REFERENCES[draft.task.reference].label} ligt
                <select
                  className="select"
                  style={{ minHeight: 34, padding: "2px 8px", width: "auto" }}
                  value={draft.orientation}
                  onChange={(e) => setDraft((d) => (d ? { ...d, orientation: e.target.value as Orientation } : d))}
                >
                  <option value="auto">vanzelf bepalen</option>
                  <option value="staand">rechtop</option>
                  <option value="liggend">dwars</option>
                </select>
              </label>
            </div>
            {referencePx !== null && referencePx < CAMERA_MEASURE.minReferencePx && (
              <p className="notice notice-warn small" style={{ margin: 0 }}>
                Het {REFERENCES[draft.task.reference].label} is klein in beeld. Kom dichterbij of zoom niet uit: dan wordt de maat
                nauwkeuriger.
              </p>
            )}
            {result && !result.ok && (
              <p className="notice notice-warn small" role="alert" style={{ margin: 0 }}>
                {result.reason}
              </p>
            )}
            {result?.ok && (
              <div className="notice small" role="status" style={{ margin: 0 }}>
                <strong>Gemeten in deze foto</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {Object.entries(result.values).map(([t, v]) => (
                    <li key={t}>
                      {targetLabel(t as CameraTarget)}: {formatMm(Math.round(v.mm))} ± {formatMm(v.uncertaintyMm)}
                      {v.uncertaintyMm > v.mm * CAMERA_MEASURE.maxRelativeUncertainty ? " — te onnauwkeurig, kom dichterbij" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <p className="notice notice-warn small" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            )}
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={!result?.ok} onClick={() => void save()}>
                Meting opslaan
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  URL.revokeObjectURL(draft.photo.url);
                  setDraft(null);
                  setView({ kind: "overview" });
                }}
              >
                Annuleren
              </button>
            </div>
          </div>
        )}

        {error && view.kind !== "mark" && (
          <p className="notice notice-warn small" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}

function refCount(task: CameraTask) {
  return task.references * 4;
}

function markCount(task: CameraTask) {
  return task.shape.kind === "rect" ? 4 : task.shape.count * 2;
}

/** Length of side i of the reference quadrilateral that point i belongs to. */
function side(points: readonly Marked[], i: number) {
  const start = i - (i % 4);
  const a = points[i]!;
  const b = points[start + ((i + 1) % 4)]!;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
