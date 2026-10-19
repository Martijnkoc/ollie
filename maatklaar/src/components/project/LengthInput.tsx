"use client";

import { useEffect, useId, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { mmToMetresInput, parseMetresToMm, parseWholeMm } from "@/lib/format";
import { MISSING, type Length } from "@/lib/projects/schema";

/**
 * Length field in metres (rooms) or millimetres (windows). Typing a value means the user states it, so it is
 * stored as confirmed. A recognised value shows where it came from and can be accepted with one click.
 */
export function LengthInput({ label, value, onChange, unit = "m", hint }: { label: string; value: Length; onChange: (l: Length) => void; unit?: "m" | "mm"; hint?: string }) {
  const id = useId();
  const toText = (mm: number | null) => (mm === null ? "" : unit === "m" ? mmToMetresInput(mm) : String(Math.round(mm)));
  const [text, setText] = useState(toText(value.mm));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(toText(value.mm));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.mm]);

  function commit() {
    if (!text.trim()) {
      if (value.mm !== null) onChange({ ...MISSING });
      setInvalid(false);
      return;
    }
    const mm = unit === "m" ? parseMetresToMm(text) : parseWholeMm(text);
    if (mm === null || mm <= 0 || mm > 100_000) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (mm !== value.mm || value.status !== "confirmed") onChange({ mm, status: "confirmed", source: "gebruiker" });
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-unit">
        <input
          id={id}
          className="input"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <span>{unit}</span>
      </div>
      <span id={`${id}-hint`} className="hint">
        {invalid ? (
          <span style={{ color: "var(--danger)" }}>{unit === "m" ? "Gebruik meters, bijvoorbeeld 4,25" : "Gebruik hele millimeters, bijvoorbeeld 1250"}</span>
        ) : value.status === "auto" ? (
          <span className="row" style={{ gap: 6 }}>
            <StatusBadge status="auto" />
            {value.sourceText ? <span>uit &ldquo;{value.sourceText}&rdquo;</span> : null}
            <button type="button" className="btn btn-sm btn-ghost" style={{ minHeight: 28, padding: "2px 8px" }} onClick={() => onChange({ ...value, status: "confirmed" })}>
              Klopt
            </button>
          </span>
        ) : value.status === "missing" ? (
          (hint ?? "Nog niet ingevuld")
        ) : (
          (hint ?? "")
        )}
      </span>
    </div>
  );
}
