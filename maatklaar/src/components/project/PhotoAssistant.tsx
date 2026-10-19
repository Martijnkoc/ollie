"use client";

import { useEffect, useRef, useState } from "react";
import { formatMm } from "@/lib/format";
import { cameraError, detectCapabilities, type Capabilities } from "@/lib/measurements/capabilities";
import { estimateOpening, type PhotoEstimate, type Pt } from "@/lib/measurements/photo";
import type { ProjectWindow } from "@/lib/projects/schema";
import { deletePhoto, loadPhoto, savePhoto } from "@/lib/projects/store";

const MAX_SIDE = 2400;
const CORNERS = ["linksboven", "rechtsboven", "rechtsonder", "linksonder"] as const;

async function toJpeg(source: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("foto");
  return { blob, width: canvas.width, height: canvas.height };
}

/**
 * Browser measuring assistant for one window: a photo (live camera or an existing picture) with an A4
 * sheet taped flat on the glass, four taps on the sheet and four on the opening. The size that follows is
 * an estimate with its tap uncertainty; tape measurements stay leading and order sizes are never derived
 * from it. Camera permission is only asked when the user starts the camera.
 */
export function PhotoAssistant({
  projectId,
  window: w,
  onChange,
  onClose,
}: {
  projectId: string;
  window: ProjectWindow;
  onChange: (w: ProjectWindow) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [mode, setMode] = useState<"start" | "camera" | "mark">(w.photo ? "mark" : "start");
  const [photo, setPhoto] = useState<{ url: string; blob: Blob | null; width: number; height: number } | null>(null);
  const [points, setPoints] = useState<Pt[]>(w.photo ? [...w.photo.reference, ...w.photo.opening] : []);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    void detectCapabilities().then(setCaps);
  }, []);

  // A saved photo comes back from this device's storage.
  useEffect(() => {
    if (!w.photo) return;
    let url: string | null = null;
    void loadPhoto(projectId, w.id).then((blob) => {
      if (!blob) {
        setMode("start");
        return;
      }
      url = URL.createObjectURL(blob);
      setPhoto({ url, blob: null, width: w.photo!.width, height: w.photo!.height });
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stopCamera, []);

  async function startCamera() {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setMode("camera");
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

  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const shot = await toJpeg(v, v.videoWidth, v.videoHeight);
    stopCamera();
    setPhoto({ url: URL.createObjectURL(shot.blob), ...shot });
    setPoints([]);
    setMode("mark");
  }

  async function choose(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) {
      setError("Kies een foto (JPG, PNG, HEIC als je browser die kan openen) van maximaal 25 MB.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const shot = await toJpeg(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      setPhoto({ url: URL.createObjectURL(shot.blob), ...shot });
      setPoints([]);
      setMode("mark");
    } catch {
      setError("Deze foto kunnen we niet openen. Kies een andere.");
    }
  }

  function tap(e: React.PointerEvent<SVGSVGElement>) {
    if (points.length >= 8 || !photo) return;
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    setPoints((ps) => [...ps, { x: Math.max(0, Math.min(photo.width, p.x)), y: Math.max(0, Math.min(photo.height, p.y)) }]);
  }

  const reference = points.slice(0, 4);
  const opening = points.slice(4, 8);
  const result = points.length === 8 ? estimateOpening(reference, opening) : null;
  const estimate: PhotoEstimate | null = result?.ok ? result.estimate : null;
  const size = estimate ? Math.max(estimate.topMm, estimate.leftMm) : 0;
  const tooRough = estimate ? estimate.uncertaintyMm > size * 0.03 : false;
  const next =
    points.length < 4
      ? `A4-vel: tik ${CORNERS[points.length]} aan`
      : points.length < 8
        ? `Raamopening (dag tot dag): tik ${CORNERS[points.length - 4]} aan`
        : null;

  async function save() {
    if (!photo) return;
    if (photo.blob) await savePhoto(projectId, w.id, photo.blob);
    onChange({
      ...w,
      photo: { takenAt: new Date().toISOString(), width: photo.width, height: photo.height, reference, opening, estimate },
    });
    dialog.current?.close();
  }

  async function remove() {
    await deletePhoto(projectId, w.id);
    onChange({ ...w, photo: null });
    dialog.current?.close();
  }

  const u = photo ? Math.max(photo.width, photo.height) / 600 : 1;

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="foto-titel" onClose={onClose} onCancel={onClose}>
      <div className="sheet-head">
        <div>
          <p className="tiny muted" style={{ margin: 0 }}>
            <span className="code">{w.code}</span> · meetassistent met foto
          </p>
          <h2 id="foto-titel" style={{ fontSize: "1.3rem", margin: 0 }}>
            Raam schatten met een foto
          </h2>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => dialog.current?.close()} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        {mode === "start" && (
          <>
            <p className="small" style={{ margin: 0 }}>
              Plak een <strong>A4-vel plat op het glas</strong> (of op het kozijn, in hetzelfde vlak als de opening). Ga recht voor het raam
              staan en zet het hele raam in beeld. Daarna tik je de hoeken aan. Je krijgt een <strong>schatting</strong> met foutmarge:
              handig om je meting te controleren, niet om op te bestellen.
            </p>
            <ul className="small" style={{ margin: 0 }} aria-label="Wat deze browser kan">
              <li>
                Camera:{" "}
                {caps === null
                  ? "controleren…"
                  : caps.camera
                    ? "beschikbaar"
                    : caps.secure
                      ? "niet beschikbaar"
                      : "alleen via een beveiligde (https) verbinding"}
              </li>
              <li>
                AR-diepte (WebXR):{" "}
                {caps === null
                  ? "controleren…"
                  : caps.xrAr === "ja"
                    ? "beschikbaar, maar nog niet gebruikt voor maten: de nauwkeurigheid is voor raamdecoratie niet aangetoond"
                    : "niet beschikbaar in deze browser"}
              </li>
              <li>Foto kiezen uit je galerij: altijd mogelijk</li>
            </ul>
            <div className="row">
              {caps?.camera && (
                <button type="button" className="btn btn-primary" onClick={() => void startCamera()}>
                  Camera starten
                </button>
              )}
              <label className="btn">
                Foto kiezen
                <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => void choose(e.target.files?.[0])} />
              </label>
            </div>
          </>
        )}

        {mode === "camera" && (
          <div className="stack-sm">
            <p className="small" style={{ margin: 0 }} aria-live="polite">
              Hele raam in beeld, recht ervoor, A4-vel goed zichtbaar. Houd je telefoon stil.
            </p>
            <div className="camera-frame">
              <video ref={video} playsInline muted autoPlay aria-label="Camerabeeld" />
              <span className="camera-guide" aria-hidden="true" />
            </div>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => void capture()}>
                Foto maken
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  stopCamera();
                  setMode("start");
                }}
              >
                Stoppen
              </button>
            </div>
          </div>
        )}

        {mode === "mark" && photo && (
          <div className="stack-sm">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <p className="small" style={{ margin: 0 }} aria-live="polite">
                <strong>{next ?? "Alle hoeken aangetikt."}</strong>
              </p>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => setZoom((z) => (z === 1 ? 2.5 : 1))}>
                  {zoom === 1 ? "Inzoomen" : "Uitzoomen"}
                </button>
                <button type="button" className="btn btn-sm" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
                  Laatste hoek weg
                </button>
              </div>
            </div>
            <div className="plan-wrap" style={{ maxHeight: "55vh" }}>
              <div className="plan-inner" style={{ width: `${zoom * 100}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={`Foto van raam ${w.code}`} draggable={false} />
                <svg
                  ref={svg}
                  viewBox={`0 0 ${photo.width} ${photo.height}`}
                  preserveAspectRatio="none"
                  role="application"
                  aria-label="Foto: tik de hoeken aan"
                  onPointerUp={tap}
                  style={{ cursor: points.length < 8 ? "crosshair" : "default" }}
                >
                  {[reference, opening].map(
                    (quad, q) =>
                      quad.length > 1 && (
                        <polygon
                          key={q}
                          points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill={q === 0 ? "rgba(185,140,60,0.18)" : "rgba(43,106,80,0.18)"}
                          stroke={q === 0 ? "#b98c3c" : "#1f4d3a"}
                          strokeWidth={3}
                          vectorEffect="non-scaling-stroke"
                        />
                      ),
                  )}
                  {points.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={6 * u}
                      fill={i < 4 ? "#b98c3c" : "#1f4d3a"}
                      stroke="#fff"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              </div>
            </div>
            {result && !result.ok && (
              <p className="notice notice-warn small" role="alert" style={{ margin: 0 }}>
                {result.reason}
              </p>
            )}
            {estimate && (
              <div className={`notice small ${tooRough ? "notice-warn" : ""}`} role="status" style={{ margin: 0 }}>
                <p style={{ margin: 0 }}>
                  <strong>Schatting uit de foto</strong> (bron: browser_scan_estimate, niet bevestigd): breedte boven ca.{" "}
                  {formatMm(Math.round(estimate.topMm))}, onder ca. {formatMm(Math.round(estimate.bottomMm))}; hoogte links ca.{" "}
                  {formatMm(Math.round(estimate.leftMm))}, rechts ca. {formatMm(Math.round(estimate.rightMm))}. Foutmarge door aantikken: ±
                  {formatMm(estimate.uncertaintyMm)}.
                </p>
                <p style={{ margin: "6px 0 0" }}>
                  {tooRough
                    ? "Te onnauwkeurig om op te vertrouwen. Kom dichterbij, gebruik meer pixels (inzoomen) of een groter vel."
                    : "Geldt alleen als het vel in hetzelfde vlak ligt als de opening. Meet altijd zelf met een rolmaat; de schatting helpt je meting te controleren."}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="notice notice-warn small" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            {mode === "mark" && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!photo || (points.length > 0 && points.length < 8)}
                onClick={() => void save()}
              >
                Opslaan bij {w.code}
              </button>
            )}
            {mode === "mark" && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPoints([]);
                  setPhoto(null);
                  setMode("start");
                }}
              >
                Andere foto
              </button>
            )}
          </div>
          {w.photo && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void remove()}>
              Foto verwijderen
            </button>
          )}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          De foto blijft op dit apparaat en wordt nergens naartoe gestuurd.
        </p>
      </div>
    </dialog>
  );
}
