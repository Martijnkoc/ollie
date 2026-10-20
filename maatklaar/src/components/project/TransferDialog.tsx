"use client";

import { BRAND } from "@/config/brand";
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useRef, useState } from "react";
import { mergeIncoming } from "@/lib/transfer/merge";
import type { Project } from "@/lib/projects/schema";
import { fetchBack, startTransfer, type ReturnContext } from "./transfer-client";

/** The transfer link as a QR code, drawn as SVG squares (no markup from a library). */
function QrCode({ text }: { text: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <svg
      viewBox={`0 0 ${cells.n + 8} ${cells.n + 8}`}
      className="qr"
      role="img"
      aria-label="QR-code om dit project op je telefoon te openen"
    >
      <rect width="100%" height="100%" fill="#fff" />
      <path d={cells.d} fill="#111" shapeRendering="crispEdges" />
    </svg>
  );
}

/**
 * Continue on the phone: a QR code with a one-time link valid for ten minutes. The project travels encrypted;
 * while this window is open, scans sent back from the phone come in here.
 */
export function TransferDialog({
  project,
  update,
  onClose,
}: {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ url: string; expiresAt: string; back: ReturnContext } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    if (started.current) return;
    started.current = true;
    startTransfer(project)
      .then(setState)
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While open: pick up scans the phone sends back.
  useEffect(() => {
    if (!state) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const incoming = await fetchBack(state.back);
        if (incoming && !stop) {
          let summary = "";
          update((p) => {
            const m = mergeIncoming(p, incoming);
            summary = `${m.updated} ${m.updated === 1 ? "raam" : "ramen"} bijgewerkt, ${m.added} nieuw`;
            return m.project;
          });
          setReceived(`Scans van je telefoon zijn binnen: ${summary}.`);
        }
      } catch {
        stop = true;
        return;
      }
      if (!stop) setTimeout(() => void tick(), 4000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [state, update]);

  const until = state ? new Date(state.expiresAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="overdracht-titel" onClose={onClose} onCancel={onClose}>
      <div className="sheet-head">
        <h2 id="overdracht-titel" style={{ fontSize: "1.3rem", margin: 0 }}>
          Scannen met je telefoon
        </h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => dialog.current?.close()} aria-label="Sluiten">
          ✕
        </button>
      </div>
      <div className="sheet-body">
        {error && (
          <p className="notice notice-warn small" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        {!state && !error && <p className="small">Overdracht voorbereiden…</p>}
        {state && (
          <>
            <p className="small" style={{ margin: 0 }}>
              Scan deze code met de camera van je telefoon. Je project opent daar in de browser, zonder app. Stuur na het scannen je ramen
              terug: ze komen dan hier binnen zolang dit venster open is.
            </p>
            <div className="qr-wrap">
              <QrCode text={state.url} />
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              Eén keer te gebruiken, geldig tot {until}. Je project gaat versleuteld; de sleutel staat alleen in deze code, niet bij
              {BRAND.name}. Er staan geen persoonsgegevens in de code.
            </p>
            <div className="field">
              <label htmlFor="overdracht-link">Of open deze link op je telefoon</label>
              <div className="row" style={{ gap: 6 }}>
                <input id="overdracht-link" className="input" readOnly value={state.url} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    void navigator.clipboard?.writeText(state.url).then(
                      () => setCopied(true),
                      () => undefined,
                    )
                  }
                >
                  {copied ? "Gekopieerd" : "Kopieer"}
                </button>
              </div>
            </div>
            <p className="small" role="status" aria-live="polite" style={{ margin: 0 }}>
              {received ?? "Wacht op scans van je telefoon…"}
            </p>
          </>
        )}
      </div>
    </dialog>
  );
}
