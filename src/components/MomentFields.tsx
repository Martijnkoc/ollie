"use client";

import { useState } from "react";

/** One to `max` datetime-local inputs, all named "moment". */
export function MomentFields({ max, min, defaults = [] }: { max: number; min: string; defaults?: string[] }) {
  const [count, setCount] = useState(Math.max(1, Math.min(max, defaults.length || 1)));
  return (
    <fieldset>
      <legend>Wanneer schikt het jou?</legend>
      <div className="stack">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="field">
            <label className="hint" htmlFor={`moment-${i}`} style={{ marginTop: 0, marginBottom: 4 }}>
              Moment {i + 1}
              {i === 0 ? "" : " (optioneel)"}
            </label>
            <input
              id={`moment-${i}`}
              type="datetime-local"
              name="moment"
              min={min}
              step={900}
              required={i === 0}
              defaultValue={defaults[i]}
            />
          </div>
        ))}
      </div>
      {count < max && (
        <button type="button" className="link-btn" style={{ marginTop: 10 }} onClick={() => setCount(count + 1)}>
          + Nog een moment voorstellen
        </button>
      )}
      <span className="hint">Tot {max} momenten; je match kiest er één. Tijdzone: Europe/Amsterdam.</span>
    </fieldset>
  );
}
